import CryptoKit
import Foundation

enum SolaxScrypt {
    static func derive(password: String, salt: Data) -> Data? {
        guard salt.count == 16 else { return nil }
        let passwordData = Data(password.utf8)
        return scrypt(password: passwordData, salt: salt, n: 16384, r: 8, p: 1, dkLen: 32)
    }

    static func matchesTestVector() -> Bool {
        let got = scrypt(password: Data(), salt: Data(), n: 16, r: 1, p: 1, dkLen: 64)
        let expected = Data(hex: "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906")
        return got == expected
    }

    private static func scrypt(password: Data, salt: Data, n: Int, r: Int, p: Int, dkLen: Int) -> Data {
        let mf = 128 * r
        let block = pbkdf2(password: password, salt: salt, dkLen: p * mf)
        var mixed = Data()
        for index in 0..<p {
            let start = index * mf
            let chunk = block.subdata(in: start..<(start + mf))
            mixed.append(romix(chunk, n: n, r: r))
        }
        return pbkdf2(password: password, salt: mixed, dkLen: dkLen)
    }

    private static func pbkdf2(password: Data, salt: Data, dkLen: Int) -> Data {
        let blockSize = 32
        let blocks = (dkLen + blockSize - 1) / blockSize
        var out = Data()
        let key = SymmetricKey(data: password)
        for index in 1...blocks {
            var message = salt
            var be = UInt32(index).bigEndian
            withUnsafeBytes(of: &be) { message.append(contentsOf: $0) }
            let mac = HMAC<SHA256>.authenticationCode(for: message, using: key)
            out.append(contentsOf: mac)
        }
        return out.prefix(dkLen)
    }

    private static func rotl(_ value: UInt32, _ count: UInt32) -> UInt32 {
        (value << count) | (value >> (32 - count))
    }

    private static func salsa20_8(_ input: Data) -> Data {
        var x = [UInt32](repeating: 0, count: 16)
        for index in 0..<16 {
            let offset = index * 4
            x[index] = UInt32(input[offset])
                | (UInt32(input[offset + 1]) << 8)
                | (UInt32(input[offset + 2]) << 16)
                | (UInt32(input[offset + 3]) << 24)
        }
        var z = x
        for _ in 0..<4 {
            z[4] ^= rotl(z[0] &+ z[12], 7)
            z[8] ^= rotl(z[4] &+ z[0], 9)
            z[12] ^= rotl(z[8] &+ z[4], 13)
            z[0] ^= rotl(z[12] &+ z[8], 18)
            z[9] ^= rotl(z[5] &+ z[1], 7)
            z[13] ^= rotl(z[9] &+ z[5], 9)
            z[1] ^= rotl(z[13] &+ z[9], 13)
            z[5] ^= rotl(z[1] &+ z[13], 18)
            z[14] ^= rotl(z[10] &+ z[6], 7)
            z[2] ^= rotl(z[14] &+ z[10], 9)
            z[6] ^= rotl(z[2] &+ z[14], 13)
            z[10] ^= rotl(z[6] &+ z[2], 18)
            z[3] ^= rotl(z[15] &+ z[11], 7)
            z[7] ^= rotl(z[3] &+ z[15], 9)
            z[11] ^= rotl(z[7] &+ z[3], 13)
            z[15] ^= rotl(z[11] &+ z[7], 18)
            z[1] ^= rotl(z[0] &+ z[3], 7)
            z[2] ^= rotl(z[1] &+ z[0], 9)
            z[3] ^= rotl(z[2] &+ z[1], 13)
            z[0] ^= rotl(z[3] &+ z[2], 18)
            z[6] ^= rotl(z[5] &+ z[4], 7)
            z[7] ^= rotl(z[6] &+ z[5], 9)
            z[4] ^= rotl(z[7] &+ z[6], 13)
            z[5] ^= rotl(z[4] &+ z[7], 18)
            z[11] ^= rotl(z[10] &+ z[9], 7)
            z[8] ^= rotl(z[11] &+ z[10], 9)
            z[9] ^= rotl(z[8] &+ z[11], 13)
            z[10] ^= rotl(z[9] &+ z[8], 18)
            z[12] ^= rotl(z[15] &+ z[14], 7)
            z[13] ^= rotl(z[12] &+ z[15], 9)
            z[14] ^= rotl(z[13] &+ z[12], 13)
            z[15] ^= rotl(z[14] &+ z[13], 18)
        }
        var out = Data(count: 64)
        for index in 0..<16 {
            let word = z[index] &+ x[index]
            let offset = index * 4
            out[offset] = UInt8(word & 0xff)
            out[offset + 1] = UInt8((word >> 8) & 0xff)
            out[offset + 2] = UInt8((word >> 16) & 0xff)
            out[offset + 3] = UInt8((word >> 24) & 0xff)
        }
        return out
    }

    private static func xor(_ left: Data, _ right: Data) -> Data {
        var out = Data(count: left.count)
        for index in 0..<left.count {
            out[index] = left[index] ^ right[index]
        }
        return out
    }

    private static func blockmix(_ input: Data, r: Int) -> Data {
        var blocks: [Data] = []
        for index in 0..<(2 * r) {
            let start = index * 64
            blocks.append(input.subdata(in: start..<(start + 64)))
        }
        var x = blocks[blocks.count - 1]
        var y: [Data] = []
        for block in blocks {
            x = salsa20_8(xor(x, block))
            y.append(x)
        }
        var even = Data()
        var odd = Data()
        for index in 0..<y.count {
            if index % 2 == 0 { even.append(y[index]) } else { odd.append(y[index]) }
        }
        even.append(odd)
        return even
    }

    private static func romix(_ input: Data, n: Int, r: Int) -> Data {
        var v: [Data] = []
        v.reserveCapacity(n)
        var x = input
        for _ in 0..<n {
            v.append(x)
            x = blockmix(x, r: r)
        }
        for _ in 0..<n {
            let offset = x.count - 64
            let j = (UInt32(x[offset])
                | (UInt32(x[offset + 1]) << 8)
                | (UInt32(x[offset + 2]) << 16)
                | (UInt32(x[offset + 3]) << 24)) % UInt32(n)
            x = blockmix(xor(x, v[Int(j)]), r: r)
        }
        return x
    }
}

private extension Data {
    init?(hex: String) {
        let chars = Array(hex)
        guard chars.count % 2 == 0 else { return nil }
        var out = Data(capacity: chars.count / 2)
        var index = 0
        while index < chars.count {
            guard let byte = UInt8(String(chars[index...index + 1]), radix: 16) else { return nil }
            out.append(byte)
            index += 2
        }
        self = out
    }
}
