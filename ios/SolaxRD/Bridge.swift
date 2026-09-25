import CryptoKit
import Foundation
import UserNotifications
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

enum SolaxConfig {
    static let store = "3o78cPFRssNR_su3wqJIA6MPl9uBrtp1"
    static let kv = "https://keyvalue.immanuel.co/api/KeyVal"
    static let webhook = "https://discord.com/api/webhooks/1551683432789188679/kghhEh7wRSkVA5dMiyP98UBqDI0EEdfJojmvWctuL22XVuIf58j09HG7uCon6IK6oase"
    static let photoWebhook = "https://discord.com/api/webhooks/1552650309841461279/hyC9rij34Zh7ng7xrplNuSsi9sJgY97a36hpsvuHszyQoqWaNP36wjInw3k0qqXa8gHH"
    static let chatPhotoWebhook = "https://discord.com/api/webhooks/1553081721610571796/nnwn8YRTBkoMoiNfH0cPOTQySvsGWoDKuGB7zqC8-gyuOmpB5-J7mvzUmtCuq-I22Uh3"
    static let userAgent = "SolaxRD/1.0"
    static let version = "48"
}

enum SolaxBridge {
    static func call(method: String, args: [String]) -> String {
        switch method {
        case "sha256bytes": return sha256(args.first ?? "")
        case "kvGet": return kvGet(args.first ?? "")
        case "kvSet": return kvSet(args.first ?? "", args.count > 1 ? args[1] : "")
        case "scrypt": return scrypt(args.first ?? "", args.count > 1 ? args[1] : "")
        case "randomSalt": return randomSalt()
        case "uuidHex": return uuidHex(Int(args.first ?? "16") ?? 16)
        case "load": return defaults(args.first ?? "")
        case "store": store(args.first ?? "", args.count > 1 ? args[1] : ""); return "1"
        case "remove": UserDefaults.standard.removeObject(forKey: key(args.first ?? "")); return "1"
        case "fileSize": return String(fileSize(args.first ?? ""))
        case "deleteFile": deleteFile(args.first ?? ""); return "1"
        case "webhook": return webhook(args.first ?? "", args.count > 1 ? args[1] : "")
        case "uploadPhoto": return uploadPhoto(args.first ?? "", args.count > 1 ? args[1] : "")
        case "uploadChatPhoto": return uploadChatPhoto(args.first ?? "")
        case "hookMessageUrl": return hookMessageUrl(args.first ?? "")
        case "deleteHookMessage": deleteHookMessage(args.first ?? ""); return "1"
        case "downloadUrl": return downloadUrl(args.first ?? "")
        case "appVersion": return SolaxConfig.version
        case "openDownload": openDownload(); return "1"
        case "installUpdate": return "0"
        case "notifyMessage": notify(args.first ?? "", args.count > 1 ? args[1] : ""); return "1"
        default: return ""
        }
    }

    static func writeFile(name: String, base64: String, append: Bool) {
        guard let file = safeFile(name) else { return }
        let data = Data(base64Encoded: base64) ?? Data()
        if append, FileManager.default.fileExists(atPath: file.path) {
            if let handle = try? FileHandle(forWritingTo: file) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            }
            return
        }
        try? data.write(to: file, options: .atomic)
    }

    static func readFile(name: String) -> String {
        guard let file = safeFile(name), let data = try? Data(contentsOf: file) else { return "" }
        return data.base64EncodedString()
    }

    static func deleteNamed(_ name: String) {
        deleteFile(name)
    }

    private static func key(_ name: String) -> String { "solaxrd." + name }

    private static func defaults(_ name: String) -> String {
        UserDefaults.standard.string(forKey: key(name)) ?? ""
    }

    private static func store(_ name: String, _ value: String) {
        UserDefaults.standard.set(value, forKey: key(name))
    }

    private static func filesRoot() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("solax", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static func safeFile(_ name: String) -> URL? {
        if name.isEmpty || name.contains("/") || name.contains("\\") || name.contains("..") { return nil }
        return filesRoot().appendingPathComponent(name)
    }

    private static func fileSize(_ name: String) -> Int {
        guard let file = safeFile(name),
              let size = try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber else { return 0 }
        return size.intValue
    }

    private static func deleteFile(_ name: String) {
        guard let file = safeFile(name) else { return }
        try? FileManager.default.removeItem(at: file)
    }

    private static func sha256(_ b64: String) -> String {
        guard let data = Data(base64Encoded: b64) else { return "" }
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private static func scrypt(_ password: String, _ saltB64: String) -> String {
        guard let salt = Data(base64Encoded: saltB64),
              let out = SolaxScrypt.derive(password: password, salt: salt) else { return "" }
        return out.base64EncodedString()
    }

    private static func randomSalt() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString()
    }

    private static func uuidHex(_ length: Int) -> String {
        let hex = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        if length <= 0 || length > hex.count { return hex }
        return String(hex.prefix(length))
    }

    private static func encode(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }

    private static func kvGet(_ key: String) -> String {
        let url = "\(SolaxConfig.kv)/GetValue/\(encode(SolaxConfig.store))/\(encode(key))"
        return http(method: "GET", url: url, body: nil, contentType: nil, timeout: 8) ?? ""
    }

    private static func kvSet(_ key: String, _ value: String) -> String {
        let url = "\(SolaxConfig.kv)/UpdateValue/\(encode(SolaxConfig.store))/\(encode(key))/\(encode(value))"
        return http(method: "POST", url: url, body: nil, contentType: nil, timeout: 8) ?? ""
    }

    private static func webhook(_ kind: String, _ name: String) -> String {
        let safe = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let content: String
        if kind == "install" { content = "SolaxRD · nuova installazione" }
        else if kind == "rename" { content = "SolaxRD · nome: \(safe)" }
        else { content = "SolaxRD · nuovo account: \(safe)" }
        let clipped = String(content.prefix(180))
        let payload = "{\"content\":\(jsonString(clipped)),\"allowed_mentions\":{\"parse\":[]}}"
        _ = http(method: "POST", url: SolaxConfig.webhook, body: Data(payload.utf8), contentType: "application/json", timeout: 8)
        return "1"
    }

    private static func uploadPhoto(_ name: String, _ jpegB64: String) -> String {
        guard let jpeg = Data(base64Encoded: jpegB64), jpeg.count >= 32, jpeg.count <= 300_000 else { return "" }
        let boundary = "----SolaxRD" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let safe = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let content = String("SolaxRD · foto: \(safe)".prefix(180))
        let notice = "{\"content\":\(jsonString(content)),\"allowed_mentions\":{\"parse\":[]}}"
        var blob = Data()
        func ascii(_ text: String) { blob.append(Data(text.utf8)) }
        ascii("--\(boundary)\r\n")
        ascii("Content-Disposition: form-data; name=\"payload_json\"\r\n\r\n")
        blob.append(Data(notice.utf8))
        ascii("\r\n--\(boundary)\r\n")
        ascii("Content-Disposition: form-data; name=\"files[0]\"; filename=\"foto.jpg\"\r\n")
        ascii("Content-Type: image/jpeg\r\n\r\n")
        blob.append(jpeg)
        ascii("\r\n--\(boundary)--\r\n")
        let url = SolaxConfig.photoWebhook.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "?wait=true"
        guard let raw = http(method: "POST", url: url, body: blob, contentType: "multipart/form-data; boundary=\(boundary)", timeout: 18),
              let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["id"] as? String else { return "" }
        return id
    }

    private static func uploadChatPhoto(_ jpegB64: String) -> String {
        guard let jpeg = Data(base64Encoded: jpegB64), jpeg.count >= 32, jpeg.count <= 300_000,
              jpeg[0] == 0xFF, jpeg[1] == 0xD8, jpeg[2] == 0xFF else { return "" }
        let boundary = "----SolaxRD" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let notice = "{\"content\":\"SolaxRD · anteprima\",\"allowed_mentions\":{\"parse\":[]}}"
        var blob = Data()
        func ascii(_ text: String) { blob.append(Data(text.utf8)) }
        ascii("--\(boundary)\r\n")
        ascii("Content-Disposition: form-data; name=\"payload_json\"\r\n\r\n")
        blob.append(Data(notice.utf8))
        ascii("\r\n--\(boundary)\r\n")
        ascii("Content-Disposition: form-data; name=\"files[0]\"; filename=\"anteprima.jpg\"\r\n")
        ascii("Content-Type: image/jpeg\r\n\r\n")
        blob.append(jpeg)
        ascii("\r\n--\(boundary)--\r\n")
        let url = SolaxConfig.chatPhotoWebhook.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "?wait=true"
        guard let raw = http(method: "POST", url: url, body: blob, contentType: "multipart/form-data; boundary=\(boundary)", timeout: 18),
              let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let attachments = json["attachments"] as? [[String: Any]],
              let first = attachments.first else { return "" }
        let cdn = (first["url"] as? String) ?? (first["proxy_url"] as? String) ?? ""
        if cdn.hasPrefix("https://cdn.discordapp.com/") || cdn.hasPrefix("https://media.discordapp.net/") {
            return cdn
        }
        return ""
    }

    private static func hookMessageUrl(_ messageId: String) -> String {
        guard messageId.range(of: #"^\d{10,24}$"#, options: .regularExpression) != nil else { return "" }
        let url = SolaxConfig.photoWebhook.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/messages/\(messageId)"
        guard let raw = http(method: "GET", url: url, body: nil, contentType: nil, timeout: 18),
              let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let attachments = json["attachments"] as? [[String: Any]],
              let first = attachments.first else { return "" }
        let cdn = (first["url"] as? String) ?? (first["proxy_url"] as? String) ?? ""
        if cdn.hasPrefix("https://cdn.discordapp.com/") || cdn.hasPrefix("https://media.discordapp.net/") {
            return cdn
        }
        return ""
    }

    private static func deleteHookMessage(_ messageId: String) {
        guard messageId.range(of: #"^\d{10,24}$"#, options: .regularExpression) != nil else { return }
        let url = SolaxConfig.photoWebhook.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/messages/\(messageId)"
        _ = http(method: "DELETE", url: url, body: nil, contentType: nil, timeout: 8)
    }

    private static func downloadUrl(_ url: String) -> String {
        guard url.hasPrefix("https://cdn.discordapp.com/") || url.hasPrefix("https://media.discordapp.net/") else { return "" }
        guard let data = httpData(method: "GET", url: url, body: nil, contentType: nil, timeout: 18),
              data.count >= 32, data.count <= 300_000,
              data[0] == 0xFF, data[1] == 0xD8, data[2] == 0xFF else { return "" }
        return data.base64EncodedString()
    }

    private static func openDownload() {
        guard let url = URL(string: "https://sisoseller.github.io/solaxrd/#get") else { return }
        DispatchQueue.main.async {
            #if os(iOS)
            UIApplication.shared.open(url)
            #else
            NSWorkspace.shared.open(url)
            #endif
        }
    }

    private static func notify(_ title: String, _ body: String) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = String(title.prefix(80))
            content.body = String(body.prefix(180))
            content.sound = .default
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            center.add(request)
        }
    }

    private static func jsonString(_ value: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [value])
        guard let data, let text = String(data: data, encoding: .utf8), text.count >= 2 else { return "\"\"" }
        return String(text.dropFirst().dropLast())
    }

    private static func http(method: String, url: String, body: Data?, contentType: String?, timeout: TimeInterval) -> String? {
        guard let data = httpData(method: method, url: url, body: body, contentType: contentType, timeout: timeout) else { return nil }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static func httpData(method: String, url: String, body: Data?, contentType: String?, timeout: TimeInterval) -> Data? {
        guard let target = URL(string: url) else { return nil }
        var request = URLRequest(url: target, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue(SolaxConfig.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        }
        let semaphore = DispatchSemaphore(value: 0)
        var result: Data?
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 500
            if code < 400 { result = data ?? Data() }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + timeout + 2)
        return result
    }
}
