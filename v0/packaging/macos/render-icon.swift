import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

private let canvasSize = 1024
private let paper = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [250.0 / 255.0, 250.0 / 255.0, 247.0 / 255.0, 1.0]
)!
private let ink = CGColor(
    colorSpace: CGColorSpaceCreateDeviceRGB(),
    components: [36.0 / 255.0, 37.0 / 255.0, 34.0 / 255.0, 1.0]
)!

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(
        Data("usage: render-icon.swift FONT_PATH OUTPUT_PNG\n".utf8)
    )
    exit(2)
}

let fontURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard
    let provider = CGDataProvider(url: fontURL as CFURL),
    let graphicsFont = CGFont(provider)
else {
    FileHandle.standardError.write(Data("could not load icon typeface\n".utf8))
    exit(1)
}

guard let context = CGContext(
    data: nil,
    width: canvasSize,
    height: canvasSize,
    bitsPerComponent: 8,
    bytesPerRow: canvasSize * 4,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
    FileHandle.standardError.write(Data("could not create icon canvas\n".utf8))
    exit(1)
}

context.clear(CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))
context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)

// A sampled superellipse gives the tile continuous, quiet corners. The
// outside pixels remain genuine transparency, not a baked checkerboard.
let tile = CGMutablePath()
let center = CGFloat(canvasSize) / 2.0
let radius: CGFloat = 496.0
let exponent = 5.0
let samples = 512
for index in 0...samples {
    let angle = Double(index) / Double(samples) * 2.0 * Double.pi
    let cosine = cos(angle)
    let sine = sin(angle)
    let x = center + radius * CGFloat(copysign(pow(abs(cosine), 2.0 / exponent), cosine))
    let y = center + radius * CGFloat(copysign(pow(abs(sine), 2.0 / exponent), sine))
    if index == 0 {
        tile.move(to: CGPoint(x: x, y: y))
    } else {
        tile.addLine(to: CGPoint(x: x, y: y))
    }
}
tile.closeSubpath()
context.addPath(tile)
context.setFillColor(paper)
context.fillPath()

func makeLine(pointSize: CGFloat) -> (CTLine, CGRect) {
    let font = CTFontCreateWithGraphicsFont(graphicsFont, pointSize, nil, nil)
    let attributes: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): ink,
    ]
    let line = CTLineCreateWithAttributedString(
        NSAttributedString(string: "zd", attributes: attributes)
    )
    let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
    return (line, bounds)
}

let targetWordmarkWidth: CGFloat = 480.0
let (_, initialBounds) = makeLine(pointSize: 400.0)
let finalPointSize = 400.0 * targetWordmarkWidth / initialBounds.width
let (wordmark, wordmarkBounds) = makeLine(pointSize: finalPointSize)
context.textPosition = CGPoint(
    x: center - wordmarkBounds.midX,
    y: center - wordmarkBounds.midY + 2.0
)
CTLineDraw(wordmark, context)

guard
    let image = context.makeImage(),
    let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    )
else {
    FileHandle.standardError.write(Data("could not create icon output\n".utf8))
    exit(1)
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
    FileHandle.standardError.write(Data("could not write icon output\n".utf8))
    exit(1)
}
