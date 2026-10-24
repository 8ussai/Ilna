# Hosting Ilna for free

This guide moves the public site off the laptop:

- **Frontend** goes to **Cloudflare Pages**. It's free and rebuilds on every push to `main`.
- **Backend, database and files** go to an **Oracle Cloud "Always Free" ARM VM** (4 cores, 24 GB RAM, up to 200 GB disk).
- The **Cloudflare tunnel** keeps bringing `api.ilna-academic.com` to the backend, so no ports are opened on the server.

Do the parts in order. Parts 1–5 can be done while the laptop demo keeps running. The site is only briefly down during parts 6–7.

---

## 1. Create the Oracle VM

1. Sign up at <https://signup.cloud.oracle.com>. Oracle asks for a card to verify you; Always Free resources are never charged.
   - **The home region you pick is permanent.** The free ARM VM only exists in it. Pick a region close to your users.
2. Go to **Compute → Instances → Create instance**.
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere → `VM.Standard.A1.Flex`, **4 OCPUs, 24 GB memory**.
   - **Networking:** keep the defaults, with "Assign a public IPv4 address" on.
   - **SSH keys:** "Generate a key pair for me" → **download the private key**. You can't download it later.
   - **Boot volume:** tick "Specify a custom boot volume size" and set **150 GB**. Up to 200 GB total is free.
3. Click Create. If you get **"Out of capacity"**, free ARM servers in your region are taken for now. Try another availability domain in the same form, or retry later.
4. Copy the instance's **Public IP address** from its page.

**Recommended:** upgrade the account to **Pay As You Go** (Billing → Upgrade). Always Free resources stay free. Oracle only reclaims idle VMs on free-only accounts, so this stops the server from being taken away. Also add a budget alert of $1 (Billing → Budgets) so you'd know if anything ever costs money.

## 2. Connect to the server from Windows

In PowerShell on the laptop, put the key in place and lock it down (Windows SSH refuses keys others can read):

```powershell
mkdir $HOME\.ssh -Force
Move-Item $HOME\Downloads\ssh-key-*.key $HOME\.ssh\ilna-oracle.key
icacls $HOME\.ssh\ilna-oracle.key /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i $HOME\.ssh\ilna-oracle.key ubuntu@<PUBLIC-IP>
```

All commands in parts 3–5 run **on the server** (inside that SSH session), unless the step says otherwise.

Tip: VS Code's **Remote - SSH** extension opens the server's folders and a terminal like a local project.

## 3. Get the code

Give the server a read-only key to the GitHub repo. This works whether the repo is public or private:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

On GitHub: **repo → Settings → Deploy keys → Add deploy key**. Paste the line and leave "Allow write access" off. Then:

```bash
ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # says "successfully authenticated"
git clone git@github.com:8ussai/Ilna.git ~/ilna
cd ~/ilna
bash deploy/setup.sh
```

`setup.sh` installs system packages, creates `venv` and installs the Python packages (10–20 minutes). It also registers the backend as a background service and schedules the nightly backup. It does **not** start the backend yet.

## 4. Copy your settings and data

**On the laptop**, close the backend window first so the database isn't changing. Then, in PowerShell in `D:\Ilna`:

```powershell
$key = "$HOME\.ssh\ilna-oracle.key"
$server = "ubuntu@<PUBLIC-IP>"
scp -i $key .env ilna.db "${server}:~/ilna/"
scp -i $key -r uploads chroma_db "${server}:~/ilna/"
```

To start with an empty site instead, copy only `.env`. The database is created on first start.

The AI models (`models/`, 2.7 GB) aren't copied. The server downloads them the first time they're needed.

## 5. Start the backend

On the server:

```bash
sudo systemctl start ilna-backend
journalctl -u ilna-backend -f          # watch it start; Ctrl+C stops watching, not the app
curl -s localhost:8000/docs | head -5  # should print HTML
```

From now on it starts by itself at boot and restarts if it crashes.

## 6. Point the API at the server (Cloudflare tunnel)

In the Cloudflare dashboard → **Zero Trust → Networks → Tunnels**:

1. Open the **existing (laptop) tunnel** → Public Hostname. **Delete the `api.ilna-academic.com` route.** The API is down from here until step 3.
2. **Create a tunnel** → Cloudflared → name it `ilna-server`. Pick **Debian, arm64**, copy the install command it shows, and run it **on the server**. The connector shows as "Healthy".
3. In the new tunnel, add a Public Hostname: subdomain `api`, domain `ilna-academic.com`, service **HTTP** `localhost:8000`.

Check that <https://api.ilna-academic.com/docs> opens.

## 7. Move the frontend to Cloudflare Pages

1. Dashboard → **Workers & Pages → Create → Pages → Connect to Git** → choose the `Ilna` repo.
2. Build settings:
   - Production branch: `main`
   - Framework preset: None
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Environment variable: `NODE_VERSION` = `24`
   
   `frontend/.env.production` already points the build at `https://api.ilna-academic.com`.
3. Wait for the first build to pass, and check the `*.pages.dev` link it gives.
4. In the **old tunnel**, delete the `ilna-academic.com` route (and `www` if it has one).
5. In the Pages project → **Custom domains**, add `ilna-academic.com` and `www.ilna-academic.com`.

Within a few minutes <https://ilna-academic.com> is served by Pages and talks to the API on the server.

## 8. Turn off the laptop demo

Once both parts work, delete the old tunnel in the dashboard (Tunnels → old tunnel → Delete). Then, in an **admin** PowerShell on the laptop:

```powershell
Stop-Service cloudflared
Set-Service cloudflared -StartupType Disabled
```

`start-demo.ps1` is no longer needed for the public site. `npm run dev` + uvicorn on the laptop keep working for development as before.

## 9. Off-server backups (Cloudflare R2)

The nightly backup already keeps the last 3 copies on the server (`~/ilna-backups`). To also keep 14 days off the server:

1. Dashboard → **R2** → create a bucket named `ilna-backups`. R2 asks for a payment method; up to 10 GB is free.
2. R2 → **Manage API tokens → Create API token**: permission "Object Read & Write", limited to that bucket. Note the **Access Key ID**, **Secret Access Key** and the **endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
3. On the server:

   ```bash
   rclone config create r2 s3 provider=Cloudflare acl=private \
       access_key_id=<ACCESS-KEY-ID> secret_access_key=<SECRET> \
       endpoint=https://<account-id>.r2.cloudflarestorage.com
   bash ~/ilna/deploy/backup.sh       # test it; the last line should say "uploaded"
   ```

**Keep `.env` in a password manager.** Backups leave it out on purpose. Without `SECRET_KEY` everyone gets logged out, and the API keys would need to be made again.

To pull a copy to the laptop now and then (PowerShell in `D:\`):

```powershell
scp -i $HOME\.ssh\ilna-oracle.key "ubuntu@<PUBLIC-IP>:~/ilna-backups/*.tar.gz" D:\ilna-backups\
```

---

## Day to day

| Task | How |
|---|---|
| Put frontend changes live | `git push`. Pages rebuilds by itself (watch it under Workers & Pages → Deployments). |
| Put backend changes live | `git push`, then on the server: `bash ~/ilna/deploy/update.sh`. Migrations run on startup. |
| A change touching both | Push, then run `update.sh` right away, so the new frontend isn't waiting long on the old backend. |
| See backend logs | `journalctl -u ilna-backend -f` (live), or `journalctl -u ilna-backend --since "1 hour ago"` |
| Restart / stop the backend | `sudo systemctl restart ilna-backend` / `sudo systemctl stop ilna-backend` |
| Look in the database | `sqlite3 ~/ilna/ilna.db`. For risky changes, try them on a copy first: `cp ilna.db /tmp/test.db`. |
| Browse files | VS Code Remote - SSH, or WinSCP with the same key |
| Check disk space | `df -h /` and `du -sh ~/ilna/uploads` |
| Change a secret | Edit `~/ilna/.env`, then restart the backend |

## Restoring a backup

```bash
sudo systemctl stop ilna-backend
cd ~/ilna
mv ilna.db ilna.db.old && mv uploads uploads.old && mv chroma_db chroma_db.old   # keep the current state, just in case
tar -xzf ~/ilna-backups/ilna-<DATE>.tar.gz        # or first: rclone copy r2:ilna-backups/ilna-<DATE>.tar.gz ~/ilna-backups/
sudo systemctl start ilna-backend
```

Once the site looks right, delete the `.old` copies.

## Limits to know

- **No GPU.** Transcription and embeddings run on the CPU, about as fast as on the laptop. A GPU server costs money; the code already switches to CUDA when one exists.
- **Disk:** 150–200 GB in total. Premium users can use 5 GB each.
- Uploads still stop at 95 MB because of Cloudflare's 100 MB limit.
