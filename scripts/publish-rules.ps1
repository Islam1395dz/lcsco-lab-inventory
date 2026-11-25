<#
.SYNOPSIS
  Publish firestore.rules to Firebase straight from Windows PowerShell.

.DESCRIPTION
  Uses a Firebase service-account JSON key to mint an OAuth2 token (RS256 JWT
  signed with the OpenSSL shipped by Git for Windows), then calls the Firebase
  Rules REST API:

    1. POST   /v1/projects/{project}/rulesets            -> new ruleset
    2. PATCH  /v1/projects/{project}/releases/cloud.firestore
                                                          -> make it live

  No Node.js, no firebase-tools, no Java required.

.PARAMETER ServiceAccountJson
  Path to the service-account key for the SAME project that hosts the Firestore
  database (lcsco-lab-inventory). Download it from:
  Firebase Console -> Project settings -> Service accounts -> Generate new private key.

.PARAMETER ProjectId
  Optional. Defaults to the key's project_id. Must match the release project.

.PARAMETER RulesFile
  Optional. Defaults to ..\firestore.rules next to this script.

.PARAMETER TestAuth
  Only mint a token and print its expiry; touch nothing.

.PARAMETER DryRun
  Create the ruleset but do not update the live release.

.PARAMETER AllowOtherProject
  Required to publish to a project other than lcsco-lab-inventory (guard against
  accidentally shipping this rules file to an unrelated Firebase project).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\publish-rules.ps1 `
      -ServiceAccountJson C:\Users\client\.firebase\lcsco-sa.json
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ServiceAccountJson,
  [string]$ProjectId,
  [string]$RulesFile,
  [switch]$TestAuth,
  [switch]$DryRun,
  [switch]$AllowOtherProject
)

$ErrorActionPreference = 'Stop'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

$expectedProject = 'lcsco-lab-inventory'
$opensslCandidates = @(
  'C:\Program Files\Git\usr\bin\openssl.exe',
  'C:\Program Files\Git\mingw64\bin\openssl.exe',
  'C:\Program Files (x86)\Git\usr\bin\openssl.exe'
)
$openssl = $opensslCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $openssl) {
  throw 'openssl.exe not found. Install Git for Windows (it ships OpenSSL) or publish from the Firebase Console instead.'
}

if (-not (Test-Path -LiteralPath $ServiceAccountJson)) {
  throw "Service-account key not found: $ServiceAccountJson"
}
if (-not $RulesFile) {
  $RulesFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'firestore.rules'
}
if (-not (Test-Path -LiteralPath $RulesFile)) {
  throw "Rules file not found: $RulesFile"
}

$sa = Get-Content -LiteralPath $ServiceAccountJson -Raw | ConvertFrom-Json
if ($sa.type -ne 'service_account' -or -not $sa.private_key -or -not $sa.client_email) {
  throw 'That file is not a service-account key (expected "type": "service_account" with private_key/client_email).'
}

if (-not $ProjectId) { $ProjectId = $sa.project_id }
if ($ProjectId -ne $sa.project_id) {
  throw "Project mismatch: the key belongs to '$($sa.project_id)' but you asked to publish to '$ProjectId'. Download a key for the target project."
}
if ($ProjectId -ne $expectedProject -and -not $AllowOtherProject) {
  throw "This key belongs to project '$ProjectId', but this repo's app uses '$expectedProject'. Refusing to publish to an unrelated project. Download a key for '$expectedProject' from the Firebase Console (Project settings -> Service accounts -> Generate new private key)."
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Uri,
    [string]$AccessToken,
    [string]$Body
  )
  $headers = @{ Authorization = "Bearer $AccessToken" }
  try {
    if ($Body) {
      return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType 'application/json' -Body $Body
    }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
  } catch {
    $detail = ''
    $response = $_.Exception.Response
    if ($response) {
      try {
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        $detail = $reader.ReadToEnd()
        $reader.Close()
      } catch { }
      if (-not $detail) { $detail = $response.StatusDescription }
    }
    if (-not $detail) { $detail = $_.Exception.Message }
    throw "$Method $Uri failed: $detail"
  }
}

# --- 1. Mint an OAuth2 access token from the service account -----------------
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$header = @{ alg = 'RS256'; typ = 'JWT' } | ConvertTo-Json -Compress
$claims = @{
  iss   = $sa.client_email
  scope = 'https://www.googleapis.com/auth/cloud-platform'
  aud   = 'https://oauth2.googleapis.com/token'
  iat   = $now
  exp   = $now + 3600
} | ConvertTo-Json -Compress

$headerB64 = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($header))
$claimsB64 = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($claims))
$signingInput = "$headerB64.$claimsB64"

$tempDir = Join-Path $env:TEMP ("lcsco-rules-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir | Out-Null
$keyPath = Join-Path $tempDir 'key.pem'
$inputPath = Join-Path $tempDir 'jwt-input.txt'
$sigPath = Join-Path $tempDir 'jwt-sig.bin'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

try {
  [IO.File]::WriteAllText($keyPath, $sa.private_key, $utf8NoBom)
  [IO.File]::WriteAllText($inputPath, $signingInput, $utf8NoBom)

  $sigOutput = & $openssl dgst -sha256 -sign $keyPath -out $sigPath $inputPath 2>&1
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $sigPath)) {
    throw "openssl signing failed: $sigOutput"
  }
  $sigB64 = ConvertTo-Base64Url ([IO.File]::ReadAllBytes($sigPath))
  $jwt = "$signingInput.$sigB64"

  $tokenBody = "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=$jwt"
  $token = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' `
    -ContentType 'application/x-www-form-urlencoded' -Body $tokenBody

  if (-not $token.access_token) { throw 'Google returned no access token.' }
  Write-Host "Authenticated as $($sa.client_email) (project $ProjectId)." -ForegroundColor Green

  if ($TestAuth) {
    Write-Host "Token OK, expires in $($token.expires_in)s. Nothing was changed (-TestAuth)." -ForegroundColor Green
    return
  }

  # --- 2. Create a ruleset from the local file -------------------------------
  $rulesText = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $RulesFile))
  $rulesetBody = @{
    source = @{ files = @(@{ name = 'firestore.rules'; content = $rulesText }) }
  } | ConvertTo-Json -Depth 8

  $ruleset = Invoke-JsonRequest -Method Post `
    -Uri "https://firebaserules.googleapis.com/v1/projects/$ProjectId/rulesets" `
    -AccessToken $token.access_token -Body $rulesetBody
  Write-Host "Created ruleset $($ruleset.name) ($([math]::Round($rulesText.Length / 1024, 1)) KB)." -ForegroundColor Green

  if ($DryRun) {
    Write-Host 'DryRun: release NOT updated. Re-run without -DryRun to publish.' -ForegroundColor Yellow
    return
  }

  # --- 3. Point the live release at the new ruleset -------------------------
  $releaseName = "projects/$ProjectId/releases/cloud.firestore"
  $releaseBody = @{
    release = @{ name = $releaseName; rulesetName = $ruleset.name }
  } | ConvertTo-Json -Depth 5

  $release = Invoke-JsonRequest -Method Patch `
    -Uri "https://firebaserules.googleapis.com/v1/$releaseName`?updateMask=rulesetName" `
    -AccessToken $token.access_token -Body $releaseBody

  Write-Host "Published. Release now serves ruleset $($release.rulesetName)." -ForegroundColor Green

  # --- 4. Prove the live ruleset actually contains the fix -------------------
  try {
    $liveRelease = Invoke-JsonRequest -Method Get `
      -Uri "https://firebaserules.googleapis.com/v1/$releaseName" -AccessToken $token.access_token
    $liveRuleset = Invoke-JsonRequest -Method Get `
      -Uri "https://firebaserules.googleapis.com/v1/$($liveRelease.rulesetName)" -AccessToken $token.access_token
    $liveSource = $liveRuleset.source.files[0].content
    if ($liveSource -match 'existsAfter\(/databases/\$\(database\)/documents/containers/') {
      Write-Host 'Verified: live ruleset resolves the transaction container with existsAfter().' -ForegroundColor Green
    } else {
      Write-Warning 'Live ruleset does not contain existsAfter() on containers — the publish may not have taken effect.'
    }
  } catch {
    Write-Warning "Published, but the verification read failed: $($_.Exception.Message)"
  }

  Write-Host 'Propagation usually takes under a minute; then retry adding a reagent (no sign-out needed).'
} finally {
  Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
