$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '.env'
$examplePath = Join-Path $PSScriptRoot '.env.example'
if (-not (Test-Path -LiteralPath $envPath)) {
  Copy-Item -LiteralPath $examplePath -Destination $envPath
}

$securePassword = Read-Host 'Enter the MySQL root password (input is hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$plainPassword = $null
$rng = $null
$randomBytes = $null

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $contents = [IO.File]::ReadAllText($envPath).Replace("`r`n", "`n")

  if ($contents -notmatch '(?m)^DB_PASS=') {
    throw 'DB_PASS was not found in backend/.env; no settings were changed.'
  }

  $passwordEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
    param($match)
    return "DB_PASS=$plainPassword"
  }
  $contents = [regex]::Replace($contents, '(?m)^DB_PASS=.*$', $passwordEvaluator)

  $secretMatches = [regex]::Matches($contents, '(?m)^SESSION_SECRET=.*$')
  if ($secretMatches.Count -eq 0 -or $secretMatches[0].Value -match '^SESSION_SECRET=(replace_with_.*)?$') {
    $randomBytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomBytes)
    $newSecret = [BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()
    $secretEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
      param($match)
      return "SESSION_SECRET=$newSecret"
    }
    if ($secretMatches.Count -eq 0) {
      $contents = $contents.TrimEnd("`r", "`n") + "`nSESSION_SECRET=$newSecret`n"
    } else {
      $contents = [regex]::Replace($contents, '(?m)^SESSION_SECRET=.*$', $secretEvaluator)
    }
  }

  [IO.File]::WriteAllText($envPath, $contents.Replace("`n", "`r`n"), (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Saved MySQL settings to backend/.env. Secret values were not displayed.' -ForegroundColor Green
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  if ($securePassword) { $securePassword.Dispose() }
  if ($rng) { $rng.Dispose() }
  if ($randomBytes) { [Array]::Clear($randomBytes, 0, $randomBytes.Length) }
  Remove-Variable plainPassword, newSecret -ErrorAction SilentlyContinue
}
