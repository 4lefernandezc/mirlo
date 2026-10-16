<#
.SYNOPSIS
  Generates Mirlo's app icon set (PNG sizes + multi-size ICO) from code.

.DESCRIPTION
  Draws a simple placeholder mark (dark rounded square, amber play glyph) with
  GDI+, then writes the standard Tauri icon files into
  app/src-tauri/icons/. Re-run to regenerate; output is deterministic.

.EXAMPLE
  powershell -NoProfile -File tools/gen-icons.ps1
#>
param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\app\src-tauri\icons")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$bgColor = [System.Drawing.Color]::FromArgb(255, 15, 17, 21)     # #0F1115
$borderColor = [System.Drawing.Color]::FromArgb(255, 43, 48, 56) # #2B3038
$glyphColor = [System.Drawing.Color]::FromArgb(255, 245, 165, 36) # #F5A524

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $d = $r * 2
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-MasterBitmap {
    $size = 512
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.Clear([System.Drawing.Color]::Transparent)

        $inset = 10.0
        $side = $size - (2 * $inset)
        $rect = New-Object System.Drawing.RectangleF($inset, $inset, $side, $side)
        $path = New-RoundedPath $rect.X $rect.Y $rect.Width $rect.Height 120
        $bgBrush = New-Object System.Drawing.SolidBrush($bgColor)
        $borderPen = New-Object System.Drawing.Pen($borderColor, 6)
        $g.FillPath($bgBrush, $path)
        $g.DrawPath($borderPen, $path)

        # Play glyph, optically centered.
        $tri = @(
            (New-Object System.Drawing.PointF(203, 156)),
            (New-Object System.Drawing.PointF(203, 356)),
            (New-Object System.Drawing.PointF(363, 256))
        )
        $glyphBrush = New-Object System.Drawing.SolidBrush($glyphColor)
        $g.FillPolygon($glyphBrush, [System.Drawing.PointF[]]$tri)

        $glyphBrush.Dispose(); $borderPen.Dispose(); $bgBrush.Dispose(); $path.Dispose()
    } finally {
        $g.Dispose()
    }
    return $bmp
}

function Save-Png($bitmap, [int]$size, [string]$path) {
    $scaled = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($scaled)
    try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.DrawImage($bitmap, 0, 0, $size, $size)
    } finally {
        $g.Dispose()
    }
    $scaled.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $scaled.Dispose()
}

function Get-PngBytes($bitmap, [int]$size) {
    $scaled = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($scaled)
    try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.DrawImage($bitmap, 0, 0, $size, $size)
    } finally {
        $g.Dispose()
    }
    $ms = New-Object System.IO.MemoryStream
    $scaled.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $scaled.Dispose()
    $bytes = $ms.ToArray()
    $ms.Dispose()
    # Comma wraps the array so PowerShell returns it as a single object
    # instead of enumerating its elements into the pipeline.
    return , $bytes
}

function Save-Ico($master, [string]$path, [int[]]$sizes) {
    $entries = @()
    foreach ($s in $sizes) { $entries += , @{ Size = $s; Bytes = (Get-PngBytes $master $s) } }

    $fs = [System.IO.File]::Create($path)
    $bw = New-Object System.IO.BinaryWriter($fs)
    try {
        $bw.Write([UInt16]0)                # reserved
        $bw.Write([UInt16]1)                # type: icon
        $bw.Write([UInt16]$entries.Count)
        $offset = 6 + 16 * $entries.Count
        foreach ($e in $entries) {
            $dim = if ($e.Size -ge 256) { 0 } else { $e.Size }
            $bw.Write([byte]$dim)           # width
            $bw.Write([byte]$dim)           # height
            $bw.Write([byte]0)              # palette
            $bw.Write([byte]0)              # reserved
            $bw.Write([UInt16]1)            # planes
            $bw.Write([UInt16]32)           # bpp
            $bw.Write([UInt32]$e.Bytes.Length)
            $bw.Write([UInt32]$offset)
            $offset += $e.Bytes.Length
        }
        foreach ($e in $entries) { $bw.Write([byte[]]$e.Bytes) }
    } finally {
        $bw.Dispose(); $fs.Dispose()
    }
}

$master = New-MasterBitmap
try {
    Save-Png $master 512 (Join-Path $OutDir "icon.png")
    Save-Png $master 256 (Join-Path $OutDir "128x128@2x.png")
    Save-Png $master 128 (Join-Path $OutDir "128x128.png")
    Save-Png $master 32 (Join-Path $OutDir "32x32.png")
    Save-Ico $master (Join-Path $OutDir "icon.ico") @(16, 32, 48, 64, 128, 256)
} finally {
    $master.Dispose()
}

Write-Host "Icons written to $OutDir"
Get-ChildItem $OutDir | ForEach-Object { Write-Host ("  {0} ({1} bytes)" -f $_.Name, $_.Length) }
