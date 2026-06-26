# Pullora

Self-hosted `yt-dlp` WebUI built for Docker and ZimaOS.

## Notice

This app was created with AI assistance. Feature requests are unlikely to be handled. Bug fixes, maintenance, and other changes may happen irregularly or not at all.

## Features

- Pullora-branded login and dashboard UI
- Pixel Soft Utility theme system with Lavender, Mint, Sky, Amber, and Graphite
- System, Light, and Dark appearance modes
- login page with session cookie authentication
- first user is created as admin from a Docker secret on first start
- admins can create users, reset passwords, and delete users
- user-scoped download history: users only see their own queue entries
- inline download options inside the New Download card
- download queue for video and audio
- video options for container, codec, and maximum resolution
- audio options for format and bitrate
- optional playlist downloads
- live status with progress, speed, and ETA
- file size and download button directly on completed queue entries
- About/Admin sheet with app version, build commit, build date, public IP, and yt-dlp diagnostics
- persistent SQLite database in `data/` inside `/media/ZimaOS-HD/AppData/pullora`
- downloads in `downloads/` inside `/media/ZimaOS-HD/AppData/pullora`

## Start on ZimaOS / Docker

Important: the ZimaOS/CasaOS app UI often cannot run local Docker builds. In that case the imported YAML must not contain `build:` and must point to an already published image, for example `ghcr.io/maroishiku/pullora:latest`.

There are two supported Compose files:

- `docker-compose.yml`: standard Docker Compose with a Docker secret.
- `docker-compose.zimaos-ui.yml`: ZimaOS/CasaOS-friendly import file with a direct bind mount for the secret file.

Both files use the published image `ghcr.io/maroishiku/pullora:latest`. The image is built by GitHub Actions after pushing to GitHub.

1. Place the project on ZimaOS:

   ```text
   /media/ZimaOS-HD/AppData/pullora
   ```

2. Configure the password secret:

   If the folders do not exist yet:

   ```bash
   mkdir -p /media/ZimaOS-HD/AppData/pullora/data
   mkdir -p /media/ZimaOS-HD/AppData/pullora/downloads
   mkdir -p /media/ZimaOS-HD/AppData/pullora/secrets
   ```

   On Windows:

   ```powershell
   Set-Content -Path .\secrets\admin_password.txt -Value "a-long-initial-admin-password"
   ```

   On Linux/macOS:

   ```bash
   printf '%s\n' 'a-long-initial-admin-password' > secrets/admin_password.txt
   ```

   On ZimaOS/Linux:

   ```bash
   printf '%s\n' 'a-long-initial-admin-password' > /media/ZimaOS-HD/AppData/pullora/secrets/admin_password.txt
   ```

3. Start the container from a terminal:

   ```bash
   cd /media/ZimaOS-HD/AppData/pullora
   docker compose up -d
   ```

   If you use the ZimaOS UI instead, import `docker-compose.zimaos-ui.yml`. The image must already have been built by GitHub Actions:

   ```yaml
   image: ghcr.io/maroishiku/pullora:latest
   ```

4. Open the WebUI:

   ```text
   http://<zimaos-ip>:8180
   ```

5. Initial login:

   ```text
   Username: admin
   Password: contents of secrets/admin_password.txt
   ```

After the first start, the admin user is stored in SQLite. Changing the secret file later does not change existing passwords automatically; use the admin sheet for that.

## Docker Compose

The relevant section in [docker-compose.yml](docker-compose.yml) is:

```yaml
image: ghcr.io/maroishiku/pullora:latest
environment:
  FIRST_ADMIN_USERNAME: admin
  FIRST_ADMIN_PASSWORD_FILE: /run/secrets/first_admin_password
volumes:
  - /media/ZimaOS-HD/AppData/pullora/data:/data
  - /media/ZimaOS-HD/AppData/pullora/downloads:/downloads
secrets:
  first_admin_password:
    file: /media/ZimaOS-HD/AppData/pullora/secrets/admin_password.txt
ports:
  - "8180:8080"
```

The Compose file intentionally uses absolute paths to `/media/ZimaOS-HD/AppData/pullora`. This keeps it unambiguous when ZimaOS/CasaOS imports the YAML or starts it from another working directory.

For the ZimaOS UI, use [docker-compose.zimaos-ui.yml](docker-compose.zimaos-ui.yml). It does not contain a local build step and uses `image:` only. Without a registry image, the ZimaOS UI cannot start the container.

## Build the Image for the ZimaOS UI

### Automatically via GitHub Actions

This project contains a workflow at `.github/workflows/publish-ghcr.yml`. Every push to GitHub builds a multi-arch image for `linux/amd64` and `linux/arm64`.

The image name is:

```text
ghcr.io/maroishiku/pullora:latest
```

Use this value in [docker-compose.zimaos-ui.yml](docker-compose.zimaos-ui.yml):

```yaml
image: ghcr.io/maroishiku/pullora:latest
```

If the GHCR package is private, ZimaOS cannot pull it without a registry login. The easiest path is to make the package public in GitHub or log Docker in to `ghcr.io` on ZimaOS.

## yt-dlp Dependencies

The Docker image installs `yt-dlp[default,curl-cffi]`. This includes the recommended default yt-dlp dependencies and `curl_cffi` for browser impersonation. It helps with sites that use TLS fingerprinting and otherwise show errors such as `The extractor is attempting impersonation, but no impersonate target is available`.

The image also includes:

- `ffmpeg` and `ffprobe` for merging, conversion, and post-processing
- `yt-dlp-ejs` through the `default` dependency group
- `deno` as the JavaScript runtime for yt-dlp-ejs
- `AtomicParsley` for selected thumbnail and metadata cases
- `rtmpdump` for older RTMP edge cases

This improves compatibility significantly, but it does not guarantee that every website works at all times. Some sites require cookies, login, PO tokens, regional IPs, or short-term yt-dlp fixes.

### Manually on a Computer with Docker

```bash
cd /path/to/project
docker build -t ghcr.io/maroishiku/pullora:latest .
docker login ghcr.io
docker push ghcr.io/maroishiku/pullora:latest
```

Then import `docker-compose.zimaos-ui.yml` in ZimaOS and keep `image:` set to exactly that name.

If no user exists on first start and the secret is missing or still set to `change-me-before-first-start`, the app exits intentionally with an error.

## Local Development

```bash
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
$env:FIRST_ADMIN_PASSWORD="dev-password-with-10-chars"
.\.venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

The WebUI is then available at `http://127.0.0.1:8080`.
