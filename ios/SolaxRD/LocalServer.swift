import Foundation
import Network

final class LocalServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "solax.http")
    private(set) var port: UInt16 = 0
    let root: URL

    init(root: URL) {
        self.root = root
    }

    func start() throws {
        let listener = try NWListener(using: .tcp, on: .any)
        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection)
        }
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { [weak self] state in
            if case .ready = state, let raw = listener.port?.rawValue {
                self?.port = raw
                ready.signal()
            }
        }
        listener.start(queue: queue)
        _ = ready.wait(timeout: .now() + 3)
        self.listener = listener
        if port == 0 { throw URLError(.cannotConnectToHost) }
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        read(connection, buffer: Data())
    }

    private func read(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, complete, _ in
            guard let self else { return }
            var next = buffer
            if let data { next.append(data) }
            if let headerEnd = next.range(of: Data("\r\n\r\n".utf8)) {
                let header = next.subdata(in: 0..<headerEnd.lowerBound)
                var body = next.subdata(in: headerEnd.upperBound..<next.count)
                let text = String(data: header, encoding: .utf8) ?? ""
                let length = self.contentLength(text)
                if body.count >= length {
                    body = body.prefix(length)
                    self.respond(connection, header: text, body: Data(body))
                    return
                }
                self.readBody(connection, header: text, body: body, needed: length)
                return
            }
            if complete {
                connection.cancel()
                return
            }
            self.read(connection, buffer: next)
        }
    }

    private func readBody(_ connection: NWConnection, header: String, body: Data, needed: Int) {
        if body.count >= needed {
            respond(connection, header: header, body: body.prefix(needed))
            return
        }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 256 * 1024) { [weak self] data, _, complete, _ in
            guard let self else { return }
            var next = body
            if let data { next.append(data) }
            if next.count >= needed || complete {
                self.respond(connection, header: header, body: next.prefix(needed))
                return
            }
            self.readBody(connection, header: header, body: next, needed: needed)
        }
    }

    private func contentLength(_ header: String) -> Int {
        for line in header.split(separator: "\r\n") {
            let lower = line.lowercased()
            if lower.hasPrefix("content-length:") {
                return Int(line.split(separator: ":").dropFirst().joined().trimmingCharacters(in: .whitespaces)) ?? 0
            }
        }
        return 0
    }

    private func respond(_ connection: NWConnection, header: String, body: Data) {
        let lines = header.split(separator: "\r\n", omittingEmptySubsequences: false)
        let request = lines.first?.split(separator: " ") ?? []
        let method = request.count > 0 ? String(request[0]) : "GET"
        let rawPath = request.count > 1 ? String(request[1]) : "/"
        let parts = rawPath.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let path = String(parts.first ?? "/")
        let query = parts.count > 1 ? String(parts[1]) : ""
        let response: Data
        if method == "POST", path == "/solax-call" {
            response = text(call(body), type: "text/plain; charset=utf-8")
        } else if path == "/solax-bin" {
            response = text(fileOp(method: method, query: query, body: body), type: "text/plain; charset=utf-8")
        } else {
            response = file(path)
        }
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func call(_ body: Data) -> String {
        guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let method = json["method"] as? String else { return "" }
        let args = (json["args"] as? [Any])?.map { String(describing: $0) } ?? []
        return SolaxBridge.call(method: method, args: args)
    }

    private func fileOp(method: String, query: String, body: Data) -> String {
        let params = queryItems(query)
        let name = params["name"] ?? ""
        let op = params["op"] ?? ""
        if method == "GET" || op == "read" { return SolaxBridge.readFile(name: name) }
        if op == "delete" { SolaxBridge.deleteNamed(name); return "1" }
        let b64 = String(data: body, encoding: .utf8) ?? ""
        if op == "append" { SolaxBridge.writeFile(name: name, base64: b64, append: true); return "1" }
        SolaxBridge.writeFile(name: name, base64: b64, append: false)
        return "1"
    }

    private func queryItems(_ query: String) -> [String: String] {
        var out: [String: String] = [:]
        for pair in query.split(separator: "&") {
            let bits = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            let key = String(bits.first ?? "").removingPercentEncoding ?? ""
            let value = bits.count > 1 ? (String(bits[1]).removingPercentEncoding ?? "") : ""
            out[key] = value
        }
        return out
    }

    private func file(_ path: String) -> Data {
        let relative: String
        switch path {
        case "/", "/index.html": relative = "index.html"
        case "/app.js": relative = "app.js"
        case "/app.css": relative = "app.css"
        case "/app-mobile.css": relative = "app-mobile.css"
        case "/backend.js": relative = "backend.js"
        case "/favicon.png": relative = "favicon.png"
        case "/vendor/peerjs.min.js": relative = "vendor/peerjs.min.js"
        default: return text("not found", type: "text/plain", status: "404 Not Found")
        }
        let url = root.appendingPathComponent(relative)
        guard let data = try? Data(contentsOf: url) else {
            return text("not found", type: "text/plain", status: "404 Not Found")
        }
        return bytes(data, type: mime(relative))
    }

    private func mime(_ name: String) -> String {
        if name.hasSuffix(".js") { return "text/javascript; charset=utf-8" }
        if name.hasSuffix(".css") { return "text/css; charset=utf-8" }
        if name.hasSuffix(".html") { return "text/html; charset=utf-8" }
        if name.hasSuffix(".png") { return "image/png" }
        return "application/octet-stream"
    }

    private func text(_ value: String, type: String, status: String = "200 OK") -> Data {
        bytes(Data(value.utf8), type: type, status: status)
    }

    private func bytes(_ data: Data, type: String, status: String = "200 OK") -> Data {
        var header = "HTTP/1.1 \(status)\r\n"
        header += "Content-Type: \(type)\r\n"
        header += "Content-Length: \(data.count)\r\n"
        header += "Connection: close\r\n\r\n"
        var out = Data(header.utf8)
        out.append(data)
        return out
    }
}
