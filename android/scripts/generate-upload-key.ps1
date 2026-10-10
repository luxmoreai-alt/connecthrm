$ErrorActionPreference = "Stop"

$androidRoot = Split-Path -Parent $PSScriptRoot
$keystoreDirectory = Join-Path $androidRoot "keystore"
$keystorePath = Join-Path $keystoreDirectory "connecthr-upload.jks"
$propertiesPath = Join-Path $androidRoot "keystore.properties"

if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $propertiesPath)) {
    throw "Upload key files already exist. They were not overwritten."
}

New-Item -ItemType Directory -Path $keystoreDirectory -Force | Out-Null
$passwordBytes = New-Object byte[] 24
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomNumberGenerator.GetBytes($passwordBytes)
$randomNumberGenerator.Dispose()
$password = [Convert]::ToBase64String($passwordBytes).Replace("+", "A").Replace("/", "B")
$alias = "connecthr-upload"

& keytool -genkeypair -v `
    -keystore $keystorePath `
    -storepass $password `
    -keypass $password `
    -alias $alias `
    -keyalg RSA `
    -keysize 4096 `
    -validity 10000 `
    -dname "CN=Connect HR, OU=Mobile, O=Connect HR, L=Chennai, ST=Tamil Nadu, C=IN"

if ($LASTEXITCODE -ne 0) {
    throw "keytool failed with exit code $LASTEXITCODE"
}

@"
storeFile=keystore/connecthr-upload.jks
storePassword=$password
keyAlias=$alias
keyPassword=$password
"@ | Set-Content -LiteralPath $propertiesPath -Encoding ascii

Write-Output "Created the Connect HR upload key and private Gradle signing properties."
Write-Output "Back up the android/keystore directory and android/keystore.properties securely."
