import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

private let width = 1200
private let height = 630
private let paper = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [250.0 / 255.0, 250.0 / 255.0, 247.0 / 255.0, 1.0]
)!
private let ink = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [36.0 / 255.0, 37.0 / 255.0, 34.0 / 255.0, 1.0]
)!
private let quiet = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [95.0 / 255.0, 98.0 / 255.0, 92.0 / 255.0, 1.0]
)!
private let accent = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [40.0 / 255.0, 76.0 / 255.0, 91.0 / 255.0, 1.0]
)!
private let hairline = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [222.0 / 255.0, 223.0 / 255.0, 217.0 / 255.0, 1.0]
)!

guard CommandLine.arguments.count == 7 else {
    FileHandle.standardError.write(
        Data(
            "usage: render-social-card.swift SCREENSHOT ICON PROSE_FONT BOLD_FONT MONO_FONT OUTPUT_PNG\n".utf8
        )
    )
    exit(2)
}

func loadImage(_ path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func loadFont(_ path: String, size: CGFloat) -> CTFont? {
    let url = URL(fileURLWithPath: path)
    guard
        let provider = CGDataProvider(url: url as CFURL),
        let graphicsFont = CGFont(provider)
    else { return nil }
    return CTFontCreateWithGraphicsFont(graphicsFont, size, nil, nil)
}

guard
    let screenshot = loadImage(CommandLine.arguments[1]),
    let icon = loadImage(CommandLine.arguments[2]),
    let prose = loadFont(CommandLine.arguments[3], size: 27),
    let bold = loadFont(CommandLine.arguments[4], size: 56),
    let mono = loadFont(CommandLine.arguments[5], size: 18),
    let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
else {
    FileHandle.standardError.write(Data("could not load social-card inputs\n".utf8))
    exit(1)
}

func drawText(_ text: String, font: CTFont, color: CGColor, x: CGFloat, baseline: CGFloat) {
    let attributes: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
    context.textPosition = CGPoint(x: x, y: baseline)
    CTLineDraw(line, context)
}

context.setFillColor(paper)
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
context.setFillColor(accent)
context.fill(CGRect(x: 0, y: 0, width: 12, height: height))

drawText("zd", font: bold, color: ink, x: 72, baseline: 538)
drawText("Keep every thread. Keep the context.", font: prose, color: quiet, x: 74, baseline: 488)
drawText("ZenSuite  ·  local agent workbench  ·  MIT", font: mono, color: accent, x: 75, baseline: 447)

context.interpolationQuality = .high
context.draw(icon, in: CGRect(x: 1032, y: 470, width: 104, height: 104))

let panel = CGRect(x: 64, y: 40, width: 1072, height: 370)
let panelPath = CGPath(
    roundedRect: panel,
    cornerWidth: 16,
    cornerHeight: 16,
    transform: nil
)
context.saveGState()
context.addPath(panelPath)
context.clip()
context.setFillColor(paper)
context.fill(panel)

let screenshotScale = panel.width / CGFloat(screenshot.width)
let screenshotHeight = CGFloat(screenshot.height) * screenshotScale
let sourceTopCrop: CGFloat = 54 * screenshotScale
let screenshotRect = CGRect(
    x: panel.minX,
    y: panel.maxY + sourceTopCrop - screenshotHeight,
    width: panel.width,
    height: screenshotHeight
)
context.draw(screenshot, in: screenshotRect)
context.restoreGState()

context.addPath(panelPath)
context.setStrokeColor(hairline)
context.setLineWidth(1)
context.strokePath()

guard
    let image = context.makeImage(),
    let destination = CGImageDestinationCreateWithURL(
        URL(fileURLWithPath: CommandLine.arguments[6]) as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    )
else {
    FileHandle.standardError.write(Data("could not create social-card output\n".utf8))
    exit(1)
}

CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
    FileHandle.standardError.write(Data("could not write social-card output\n".utf8))
    exit(1)
}
