const clients = new Set();

function addClient(res) { clients.add(res); }
function removeClient(res) { clients.delete(res); }

function emit(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...clients]) {
    try { res.write(msg); } catch { clients.delete(res); }
  }
}

module.exports = { addClient, removeClient, emit };
