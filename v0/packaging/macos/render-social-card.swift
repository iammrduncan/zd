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

guard CommandLine.arguments.count == 9 else {
    FileHandle.standardError.write(
        Data(
            "usage: render-social-card.swift LIGHT_SCREENSHOT DARK_SCREENSHOT DRACULA_SCREENSHOT ICON PROSE_FONT BOLD_FONT MONO_FONT OUTPUT_PNG\n".utf8
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
    let lightScreenshot = loadImage(CommandLine.arguments[1]),
    let darkScreenshot = loadImage(CommandLine.arguments[2]),
    let draculaScreenshot = loadImage(CommandLine.arguments[3]),
    let icon = loadImage(CommandLine.arguments[4]),
    let prose = loadFont(CommandLine.arguments[5], size: 27),
    let bold = loadFont(CommandLine.arguments[6], size: 56),
    let mono = loadFont(CommandLine.arguments[7], size: 18),
    let label = loadFont(CommandLine.arguments[7], size: 14),
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

func drawThemeCard(_ screenshot: CGImage, labelText: String, swatch: CGColor, frame: CGRect) {
    context.setFillColor(swatch)
    context.fillEllipse(in: CGRect(x: frame.minX, y: frame.maxY + 19, width: 8, height: 8))
    drawText(labelText, font: label, color: quiet, x: frame.minX + 18, baseline: frame.maxY + 18)

    let path = CGPath(
        roundedRect: frame,
        cornerWidth: 12,
        cornerHeight: 12,
        transform: nil
    )
    context.saveGState()
    context.addPath(path)
    context.clip()
    context.interpolationQuality = .high
    context.draw(screenshot, in: frame)
    context.restoreGState()

    context.addPath(path)
    context.setStrokeColor(hairline)
    context.setLineWidth(1)
    context.strokePath()
}

context.setFillColor(paper)
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
context.setFillColor(accent)
context.fill(CGRect(x: 0, y: 0, width: 12, height: height))

drawText("zd", font: bold, color: ink, x: 72, baseline: 530)
drawText("Markdown, rendered and editable.", font: prose, color: quiet, x: 74, baseline: 477)
drawText("ZenSuite  ·  local Markdown and agent workbench  ·  MIT", font: mono, color: accent, x: 75, baseline: 435)

context.interpolationQuality = .high
context.draw(icon, in: CGRect(x: 1032, y: 462, width: 104, height: 104))

let currentLightSwatch = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [40.0 / 255.0, 76.0 / 255.0, 91.0 / 255.0, 1.0]
)
let darkSwatch = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [25.0 / 255.0, 26.0 / 255.0, 25.0 / 255.0, 1.0]
)
let draculaSwatch = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [189.0 / 255.0, 147.0 / 255.0, 249.0 / 255.0, 1.0]
)

drawThemeCard(
    lightScreenshot,
    labelText: "CURRENT LIGHT",
    swatch: currentLightSwatch!,
    frame: CGRect(x: 64, y: 54, width: 344, height: 215)
)
drawThemeCard(
    darkScreenshot,
    labelText: "DARK",
    swatch: darkSwatch!,
    frame: CGRect(x: 428, y: 54, width: 344, height: 215)
)
drawThemeCard(
    draculaScreenshot,
    labelText: "DRACULA",
    swatch: draculaSwatch!,
    frame: CGRect(x: 792, y: 54, width: 344, height: 215)
)

guard
    let image = context.makeImage(),
    let destination = CGImageDestinationCreateWithURL(
        URL(fileURLWithPath: CommandLine.arguments[8]) as CFURL,
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
