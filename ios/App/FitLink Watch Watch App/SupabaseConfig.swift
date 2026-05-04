import Foundation

enum SupabaseConfig {
    static let url = "https://iyvvskywmqtudafapxdk.supabase.co"
    static let anonKey = "sb_publishable_rYwv3BX4sTnL8w0GXmCF1Q_Zpxm0rxE"
    
    static var rpcURL: URL {
        URL(string: "\(url)/rest/v1/rpc")!
    }
    
    static func rpcURL(for functionName: String) -> URL {
        URL(string: "\(url)/rest/v1/rpc/\(functionName)")!
    }
}
