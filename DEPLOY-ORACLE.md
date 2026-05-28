# Oracle Cloud (Always Free)

Oracle is one way to get a **free** VPS. The Docker steps are the same as any other Linux server.

**Use the main guide:** **[DEPLOY-VPS.md](DEPLOY-VPS.md)** — sections 4–6 (clone, `.env`, `vps-deploy.sh`).

---

## Oracle-only steps

### Create VM

1. [Oracle Cloud Free](https://www.oracle.com/cloud/free/) → **Compute → Instances → Create**
2. **Ubuntu 24.04** (aarch64), shape **VM.Standard.A1.Flex** — 1 OCPU, 6 GB RAM
3. Assign **public IPv4**, add your **SSH public key**
4. Create instance → copy **public IP**

### Firewall (Oracle console)

**Networking → VCN → Security Lists → Ingress rule:**

- Source `0.0.0.0/0`, TCP port **3001**

Then on the VM follow **[DEPLOY-VPS.md](DEPLOY-VPS.md)** from “Bootstrap Docker”.

---

If Oracle signup or card verification fails, use **Timeweb / Hetzner / hoster.by** with the same `DEPLOY-VPS.md` guide.
