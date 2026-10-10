# Connect HR Android app

This project packages `https://hrm-5byz.vercel.app/` as a Trusted Web Activity for Google Play.

- Application ID: `com.connecthr.hrms`
- Version: `1.0.0` (`versionCode` 1)
- Compile/target SDK: 36

The release upload key and `keystore.properties` are intentionally excluded from Git. Back them up securely; they are required to sign future uploads.

Build from this directory with:

```powershell
.\gradlew.bat bundleRelease
```

The signed bundle is created at `app/build/outputs/bundle/release/app-release.aab`.

After the first Play Console upload, copy the SHA-256 fingerprint under **Setup > App integrity > App signing key certificate** into `frontend/public/.well-known/assetlinks.json` alongside the upload-key fingerprint, then redeploy the frontend. Google Play signs distributed builds with the app-signing key, which is different from the local upload key.
