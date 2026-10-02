// Overlay window: shows the live monitor numbers (sent by the main process).
const g = document.getElementById('g');
const cls = (v, hi, crit) => (v == null ? '' : v >= crit ? 'crit' : v >= hi ? 'hot' : '');
const row = (k, v, unit, c = '') => `<span class="k">${k}</span><span class="v ${c}">${v == null ? 'n/a' : `${v}${unit}`}</span>`;
window.woof.onMonitor((m) => {
  const temp = m.gpuTemp != null ? m.gpuTemp : m.cpuTemp;
  g.innerHTML = row('CPU', m.cpu, '%', cls(m.cpu, 85, 95)) + row('GPU', m.gpu, '%') + row('RAM', m.ram, '%', cls(m.ram, 85, 95)) + row('Temp', temp, '°C', cls(temp, 80, 90)) + row('Ping', m.ping, ' ms', cls(m.ping, 80, 150)) + (m.throttling ? '<span class="k crit">Heat</span><span class="v crit">Throttling</span>' : '');
});
