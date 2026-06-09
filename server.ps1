# Simple PowerShell HTTP Server for hosting static files
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "PowerShell Web Server is running at http://localhost:8080/"
Write-Host "Press Ctrl+C in the terminal to stop."

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Parse path
        $url = $request.Url.LocalPath
        if ($url -eq "/") {
            $url = "/index.html"
        }
        
        # Map to file path
        $filePath = Join-Path (Get-Location) $url
        
        if (Test-Path $filePath -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($filePath)
            $contentType = "text/plain; charset=utf-8"
            
            # Map content types
            if ($extension -eq ".html") { $contentType = "text/html; charset=utf-8" }
            elseif ($extension -eq ".css") { $contentType = "text/css; charset=utf-8" }
            elseif ($extension -eq ".js") { $contentType = "application/javascript; charset=utf-8" }
            
            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $response.Close()
    } catch {
        Write-Host "Error serving request: $_"
    }
}
$listener.Stop()
