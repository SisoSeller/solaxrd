import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = MainViewController()
        window.backgroundColor = .black
        window.makeKeyAndVisible()
        self.window = window
        lockMacWindow()
        return true
    }
}

func lockMacWindow() {
    #if targetEnvironment(macCatalyst)
    let minimum = CGSize(width: 1024, height: 792)
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.forEach { scene in
        scene.sizeRestrictions?.minimumSize = minimum
        scene.windows.forEach { window in
            var frame = window.frame
            if frame.size.width < minimum.width || frame.size.height < minimum.height {
                frame.size.width = max(frame.size.width, minimum.width)
                frame.size.height = max(frame.size.height, minimum.height)
                window.frame = frame
            }
        }
    }
    #endif
}
