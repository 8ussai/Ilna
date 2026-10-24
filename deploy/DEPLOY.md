# Hosting Ilna

Ilna is hosted for free:

- **Frontend:** a **Cloudflare Worker** named `ilna` serves the built site at `ilna-academic.com` and `www.ilna-academic.com`. It rebuilds on every push to `main` (`frontend/wrangler.jsonc`).
- **Backend, database and files:** an **Oracle Cloud "Always Free" ARM VM** runs the API as the `ilna-backend` service. It also holds `ilna.db`, `uploads/` and `chroma_db/`.
- **Cloudflare tunnel** `ilna-server` brings `api.ilna-academic.com` to the backend on `localhost:8000`, so no ports are open on the server.

## The current setup

| | |
|---|---|
| Server | Oracle VM in **Saudi Arabia Central (Riyadh)**, Ubuntu 24.04 ARM, 4 cores, 24 GB RAM, 150 GB disk |
| Address | `84.13.147.223`. It's an ephemeral IP that changes if the VM is stopped; the site keeps working through the tunnel, only SSH needs the new IP. |
| Login | `ssh -i ~/.ssh/ilna-oracle ubuntu@84.13.147.223` (the key is on the dev laptop) |
| Project folder | `~/ilna` (a clone of `main`), with `.env`, `ilna.db`, `uploads/`, `chroma_db/`, `models/` |
| Backups | `~/ilna-backups`, nightly at 03:30 UTC, last 3 kept |

`.env`, the database, uploads, the search index and the AI models are **not in git**. Each machine has its own copy, so the laptop's copy is only for development.

---

## Working on changes

1. Work on a branch and test it on the laptop (`DEVELOPMENT.md` covers running it). Run `npm run build` in `frontend` before merging; Cloudflare runs the same build.
2. Merge into `main` and push. Only `main` is live.
3. What happens next:

| Change | What to do |
|---|---|
| Frontend only | Nothing. Cloudflare rebuilds and deploys within a minute or two (Workers & Pages → ilna → Deployments). |
| Backend | Run `update.sh` on the server (below). It pulls `main`, installs packages only if `requirements.txt` changed, and restarts. Migrations run on startup. |
| Both | Push, then run `update.sh` right away, so the new frontend isn't left waiting on the old backend. |
| A new setting in `.env` | Add it to `.env.example` in the branch, and put the real value in `~/ilna/.env` on the server **before** running `update.sh`. |

From the laptop:

```powershell
ssh -i ~/.ssh/ilna-oracle ubuntu@84.13.147.223 "bash ~/ilna/deploy/update.sh"
```

## Day to day on the server

| Task | How |
|---|---|
| Backend logs | `journalctl -u ilna-backend -f` (live) or `journalctl -u ilna-backend --since "1 hour ago"` |
| Restart / stop the backend | `sudo systemctl restart ilna-backend` / `sudo systemctl stop ilna-backend` |
| Change a setting or secret | `nano ~/ilna/.env`, then restart the backend. Changing `SECRET_KEY` logs everyone out. |
| Look in the database | `sqlite3 ~/ilna/ilna.db`. Try risky changes on a copy first: `cp ilna.db /tmp/test.db`. |
| Back up now (before something risky) | `bash ~/ilna/deploy/backup.sh` |
| Tunnel status | `systemctl status cloudflared`, or the Cloudflare dashboard → Zero Trust → Networks → Tunnels |
| Browse files | VS Code **Remote - SSH**, or WinSCP with the same key |
| Disk space | `df -h /` and `du -sh ~/ilna/uploads` |

## Backups

`deploy/backup.sh` runs every night from cron. It saves `ilna.db` (copied safely while the app runs), `uploads/` and `chroma_db/` into one file, `~/ilna-backups/ilna-<date>.tar.gz`, and keeps the newest 3.

Left out: `.env`, which you should **keep in a password manager**, and `models/`, which downloads again by itself.

**Copy the backups to the laptop now and then** (PowerShell):

```powershell
mkdir D:\ilna-backups -Force
scp -i ~/.ssh/ilna-oracle "ubuntu@84.13.147.223:~/ilna-backups/*.tar.gz" D:\ilna-backups\
```

**Optional: off-server copies in Cloudflare R2.** The script also uploads each backup and keeps 14 days there, once rclone has a remote named `r2`:

1. Cloudflare → **R2** → create a bucket `ilna-backups`. R2 asks for a payment method; 10 GB is free.
2. R2 → **Manage API tokens → Create API token**: "Object Read & Write", limited to that bucket. Note the Access Key ID, Secret Access Key and endpoint.
3. On the server:

   ```bash
   rclone config create r2 s3 provider=Cloudflare acl=private \
       access_key_id=<ACCESS-KEY-ID> secret_access_key=<SECRET> \
       endpoint=https://<account-id>.r2.cloudflarestorage.com
   bash ~/ilna/deploy/backup.sh       # the last line should say "uploaded"
   ```

### Restoring a backup

```bash
sudo systemctl stop ilna-backend
cd ~/ilna
mv ilna.db ilna.db.old && mv uploads uploads.old && mv chroma_db chroma_db.old   # keep the current state, just in case
tar -xzf ~/ilna-backups/ilna-<DATE>.tar.gz        # or first: rclone copy r2:ilna-backups/ilna-<DATE>.tar.gz ~/ilna-backups/
sudo systemctl start ilna-backend
```

Once the site looks right, delete the `.old` copies.

---

## Setting it up from scratch

Use this to rebuild the server, or to move to a new one. Do the parts in order.

### 1. Create the Oracle VM

1. Sign up at <https://signup.cloud.oracle.com>. Oracle asks for a card to verify you; Always Free resources are never charged. **The home region is permanent**, and the free ARM VM only exists there.
2. **Upgrade to Pay As You Go** (Billing → Upgrade) and add a $1 budget alert. Always Free resources stay free, and Oracle stops reclaiming idle free VMs.
3. **Compute → Instances → Create instance**:
   - **Image:** **Canonical Ubuntu 24.04**. The default is Oracle Linux, which `setup.sh` doesn't support.
   - **Shape:** Ampere → `VM.Standard.A1.Flex`, **4 OCPUs, 24 GB**. The default (1 OCPU, 6 GB) is too small for the AI models. If it's "Out of capacity", retry later or start with 2 OCPUs / 12 GB.
   - **Networking:** "Create new virtual cloud network" + "Create new public subnet", with "Automatically assign public IPv4 address" on. You can reuse an existing VCN instead.
   - **SSH keys:** paste the public key (`~/.ssh/ilna-oracle.pub` on the laptop; make one with `ssh-keygen -t ed25519 -f ~/.ssh/ilna-oracle`). Or let Oracle generate one and **download the private key**, which you can't download later.
   - **Boot volume:** custom size **150 GB**. 200 GB total is free, and boot volumes of terminated VMs count too, so delete those.
4. If the VM has **no public IP**: on its **Networking** tab, run the quick action **"Connect public subnet to internet"**. Then open the VNIC → **IP administration** → **⋯** on the private IP → **Edit** → **Ephemeral public IP**.
5. Log in: `ssh -i ~/.ssh/ilna-oracle ubuntu@<PUBLIC-IP>`. "Permission denied" for `ubuntu` usually means the image is Oracle Linux (user `opc`); recreate it with Ubuntu.

### 2. Install

On the server:

```bash
git clone https://github.com/8ussai/Ilna.git ~/ilna
cd ~/ilna
bash deploy/setup.sh
```

`setup.sh` takes 10–20 minutes. It installs system packages and the Python packages (the CPU-only torch when there's no NVIDIA GPU), registers the `ilna-backend` service, and schedules the nightly backup. It does **not** start the backend.

If the repo is ever private, add a read-only deploy key first: on the server, run `ssh-keygen -t ed25519` and add `~/.ssh/id_ed25519.pub` under GitHub → repo → Settings → Deploy keys. Then clone `git@github.com:8ussai/Ilna.git`.

### 3. Copy settings and data, then start

From the laptop, or from a backup, put `.env` and the data into `~/ilna`. With the old backend stopped, so the database isn't changing:

```powershell
scp -i ~/.ssh/ilna-oracle .env "ubuntu@<PUBLIC-IP>:~/ilna/"
```

```bash
# on the server, from the newest backup (copied over with scp first)
cd ~/ilna && tar -xzf ~/ilna-backups/ilna-<DATE>.tar.gz
```

For an empty site, copy only `.env`; the database is created on first start. The AI models (2.7 GB) download the first time they're needed.

```bash
sudo systemctl start ilna-backend
journalctl -u ilna-backend -f          # Ctrl+C stops watching, not the app
curl -s localhost:8000/docs | head -5  # should print HTML
```

### 4. Tunnel for the API

In Cloudflare → **Zero Trust → Networks → Tunnels**:

1. Moving to a new server? Just run the `ilna-server` tunnel's install command on the new server (tunnel → **Add a replica**), then uninstall cloudflared from the old one. The route stays.
2. Otherwise, **Create a tunnel** → Cloudflared → `ilna-server` → **Debian, arm64**. Run its install and `sudo cloudflared service install <token>` commands on the server.
3. Add a route: subdomain `api`, domain `ilna-academic.com`, service URL **`http://localhost:8000`** (it must start with `http://`).

Check that <https://api.ilna-academic.com/docs> opens.

### 5. Frontend on Cloudflare Workers

Only needed if the `ilna` Worker doesn't exist yet.

1. **Workers & Pages → Create → Import a repository** → `8ussai/Ilna`.
2. Project name `ilna` (must match `wrangler.jsonc`), build command `npm run build`, deploy command `npx wrangler deploy`.
3. In the Worker → **Settings → Builds**: **Root directory** `/frontend`, build variable `NODE_VERSION` = `24`, and builds for non-production branches **off**.
4. **Settings → Domains & Routes → Add → Custom domain**: `ilna-academic.com` and `www.ilna-academic.com`. Delete any old `@`/`www` DNS records pointing to a tunnel first.

`frontend/.env.production` points the build at `https://api.ilna-academic.com`. The backend only accepts requests from `ilna-academic.com` (CORS in `backend/main.py`), so logins don't work on other addresses.

## Limits to know

- **No GPU.** Transcription and embeddings run on the CPU. A GPU server costs money; the code switches to CUDA by itself when there is one, and `setup.sh` then installs the GPU build of torch.
- **Disk:** 150 GB now, 200 GB free in total. Premium users can use 5 GB each.
- Uploads stop at 95 MB because of Cloudflare's 100 MB limit.
