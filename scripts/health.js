// Healthcheck do container (usado pelo Docker/Swarm no deploy zero-downtime):
// sai 0 se /healthz responde 200, 1 caso contrário. O Swarm só promove o
// container novo — e o Traefik só passa a rotear para ele — quando isto passa.
fetch('http://127.0.0.1:3000/healthz')
  .then((r) => process.exit(r.ok ? 0 : 1))
  .catch(() => process.exit(1));
