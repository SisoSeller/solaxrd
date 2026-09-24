import UIKit
import UserNotifications
import WebKit

final class MainViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private var web: WKWebView?
    private var server: LocalServer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard SolaxScrypt.matchesTestVector() else {
            show("SolaxRD non riesce a preparare gli account.")
            return
        }
        let root = Bundle.main.resourceURL?.appendingPathComponent("web") ?? Bundle.main.bundleURL
        let server = LocalServer(root: root)
        do {
            try server.start()
        } catch {
            show("SolaxRD non riesce a partire.")
            return
        }
        self.server = server

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let script = WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(script)
        let web = WKWebView(frame: view.bounds, configuration: config)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.uiDelegate = self
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(web)
        self.web = web
        let url = URL(string: "http://127.0.0.1:\(server.port)/index.html")!
        web.load(URLRequest(url: url))
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard prompt.hasPrefix("solax:") else {
            completionHandler("")
            return
        }
        let raw = String(prompt.dropFirst(6))
        guard let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let method = json["method"] as? String else {
            completionHandler("")
            return
        }
        let args = (json["args"] as? [Any])?.map { value -> String in
            if let text = value as? String { return text }
            return String(describing: value)
        } ?? []
        completionHandler(SolaxBridge.call(method: method, args: args))
    }

    private func show(_ text: String) {
        let label = UILabel(frame: view.bounds)
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        label.text = text
        view.addSubview(label)
    }

    private static let bridgeScript = """
    window.SolaxIOS = true;
    function solaxCall(method, args) {
      try {
        var raw = window.prompt("solax:" + JSON.stringify({ method: method, args: args || [] }));
        return raw == null ? "" : raw;
      } catch (e) {
        return "";
      }
    }
    function solaxFile(op, name, body) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/solax-bin?op=" + encodeURIComponent(op) + "&name=" + encodeURIComponent(name), false);
        xhr.setRequestHeader("Content-Type", "text/plain");
        xhr.send(body || "");
        return xhr.responseText || "";
      } catch (e) {
        return "";
      }
    }
    window.SolaxNative = {
      sha256bytes: function (b64) { return solaxCall("sha256bytes", [b64]); },
      kvGet: function (key) { return solaxCall("kvGet", [key]); },
      kvSet: function (key, value) { return solaxCall("kvSet", [key, value]); },
      scrypt: function (password, salt) { return solaxCall("scrypt", [password, salt]); },
      randomSalt: function () { return solaxCall("randomSalt", []); },
      uuidHex: function (len) { return solaxCall("uuidHex", [String(len || 16)]); },
      load: function (key) { return solaxCall("load", [key]); },
      store: function (key, value) { solaxCall("store", [key, value]); },
      remove: function (key) { solaxCall("remove", [key]); },
      fileSize: function (name) { return Number(solaxCall("fileSize", [name]) || 0); },
      deleteFile: function (name) { solaxFile("delete", name, ""); },
      writeFile: function (name, b64) { solaxFile("write", name, b64); },
      appendFile: function (name, b64) { solaxFile("append", name, b64); },
      readFile: function (name) { return solaxFile("read", name, ""); },
      webhook: function (kind, name) { return solaxCall("webhook", [kind, name || ""]); },
      uploadPhoto: function (name, jpeg) { return solaxCall("uploadPhoto", [name, jpeg]); },
      hookMessageUrl: function (id) { return solaxCall("hookMessageUrl", [id]); },
      deleteHookMessage: function (id) { solaxCall("deleteHookMessage", [id]); },
      downloadUrl: function (url) { return solaxCall("downloadUrl", [url]); },
      appVersion: function () { return solaxCall("appVersion", []); },
      installUpdate: function () { return "0"; },
      openDownload: function () { return solaxCall("openDownload", []); },
      notifyMessage: function (title, body) { solaxCall("notifyMessage", [title, body]); }
    };
    """
}
