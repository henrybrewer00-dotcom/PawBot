// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "PawbotPrototype",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "PawbotPrototype", targets: ["PawbotPrototype"])
    ],
    targets: [
        .executableTarget(
            name: "PawbotPrototype",
            path: "Sources/PawbotPrototype"
        )
    ]
)
