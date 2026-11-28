/**
 * Ключ, которым сайт и lab-runner заходят на учебные стенды: npm run lab:key
 * Создаёт .lab/id_ed25519 и .lab/id_ed25519.pub (если их ещё нет) и печатает
 * публичный ключ — его кладут в authorized_keys стенда (это делает provision.sh).
 */
import fs from "node:fs";
import path from "node:path";
import ssh2 from "ssh2";

const dir = path.resolve(process.cwd(), ".lab");
const priv = path.join(dir, "id_ed25519");
const pub = `${priv}.pub`;

if (!fs.existsSync(priv)) {
  fs.mkdirSync(dir, { recursive: true });
  const keys = ssh2.utils.generateKeyPairSync("ed25519", { comment: "lab-runner" });
  fs.writeFileSync(priv, keys.private, { mode: 0o600 });
  fs.writeFileSync(pub, `${keys.public}\n`);
  console.error(`Создан ключ ${priv}`);
}
process.stdout.write(fs.readFileSync(pub, "utf8").trim() + "\n");
