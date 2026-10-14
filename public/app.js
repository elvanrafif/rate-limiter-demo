const algorithms = {
  'fixed-window': 'Counts requests in fixed 60-second windows. Simple and fast, but bursts can happen at window boundaries.',
  'sliding-log': 'Stores each request timestamp and counts the last 60 seconds. Precise, with more Redis memory per client.',
  'token-bucket': 'Refills up to 10 tokens over 60 seconds. Allows a short burst, then settles into a steady rate.',
};

const clientIdKey = 'rate-limiter-demo-client-id';
const clientId = localStorage.getItem(clientIdKey) || crypto.randomUUID();
localStorage.setItem(clientIdKey, clientId);

const tabs = [...document.querySelectorAll('[data-algorithm]')];
const description = document.querySelector('#algorithm-description');
const list = document.querySelector('#result-list');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#result-count');
const quotaLabel = document.querySelector('#quota-label');
const progress = document.querySelector('#quota-progress');
const fill = document.querySelector('#quota-fill');
const errorMessage = document.querySelector('#request-error');
const buttons = [...document.querySelectorAll('.request-actions button')];
let activeAlgorithm = 'fixed-window';
let results = [];
const quotas = Object.fromEntries(Object.keys(algorithms).map((algorithm) => [algorithm, 10]));

description.textContent = algorithms[activeAlgorithm];

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activeAlgorithm = tab.dataset.algorithm;
    tabs.forEach((item) => {
      const selected = item === tab;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    description.textContent = algorithms[activeAlgorithm];
    updateQuota(quotas[activeAlgorithm]);
  });
});

function updateQuota(remaining) {
  const safeRemaining = Math.max(0, Math.min(10, Number(remaining)));
  quotaLabel.textContent = `${safeRemaining} / 10 remaining`;
  progress.setAttribute('aria-valuenow', String(safeRemaining));
  fill.style.width = `${safeRemaining * 10}%`;
}

function renderResults() {
  list.replaceChildren();
  emptyState.hidden = results.length > 0;
  if (!results.length) list.append(emptyState);
  count.textContent = String(results.length);

  for (const result of results) {
    const row = document.createElement('li');
    row.className = 'result-row';

    const time = document.createElement('time');
    time.className = 'result-time';
    time.dateTime = result.date.toISOString();
    time.textContent = result.date.toLocaleTimeString();
    const algorithm = document.createElement('span');
    algorithm.className = 'result-algorithm';
    algorithm.textContent = result.algorithmLabel;
    time.append(algorithm);

    const status = document.createElement('span');
    status.className = `result-status ${result.status === 200 ? 'is-allowed' : 'is-blocked'}`;
    status.textContent = String(result.status);

    const remaining = document.createElement('span');
    remaining.className = 'result-remaining';
    remaining.textContent = `${result.remaining} / 10 remaining`;

    const retry = document.createElement('span');
    retry.className = 'result-retry';
    retry.textContent = result.retryAfter ? `Retry in ${result.retryAfter}s` : '';

    row.append(time, status, remaining, retry);
    list.append(row);
  }
}

async function sendRequest(algorithm) {
  const response = await fetch(`/api/demo/${algorithm}`, {
    method: 'POST',
    headers: { 'x-client-id': clientId },
  });
  const body = await response.json();
  if (response.status !== 200 && response.status !== 429) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return { response, body, date: new Date() };
}

function addResult({ response, body, date }, algorithm) {
  const result = {
    date,
    algorithmLabel: algorithm.replaceAll('-', ' '),
    status: response.status,
    remaining: body.remaining,
    retryAfter: body.retryAfterSeconds,
  };
  results.unshift(result);
  results = results.slice(0, 50);
  quotas[algorithm] = result.remaining;
  updateQuota(quotas[activeAlgorithm]);
  renderResults();
}

async function withBusy(action) {
  buttons.forEach((button) => { button.disabled = true; });
  errorMessage.hidden = true;
  try {
    await action();
  } catch (error) {
    errorMessage.textContent = error.message || 'Unable to reach the demo API. Please try again.';
    errorMessage.hidden = false;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

document.querySelector('#send-one').addEventListener('click', () => withBusy(async () => {
  addResult(await sendRequest(activeAlgorithm), activeAlgorithm);
}));

document.querySelector('#send-batch').addEventListener('click', () => withBusy(async () => {
  const algorithm = activeAlgorithm;
  const responses = await Promise.all(
    Array.from({ length: 15 }, () => sendRequest(algorithm)),
  );
  responses.forEach((result) => addResult(result, algorithm));
}));

document.querySelector('#reset').addEventListener('click', () => withBusy(async () => {
  const response = await fetch('/api/reset', {
    method: 'POST',
    headers: { 'x-client-id': clientId },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Reset failed (${response.status})`);
  Object.keys(quotas).forEach((algorithm) => { quotas[algorithm] = 10; });
  updateQuota(quotas[activeAlgorithm]);
  errorMessage.hidden = true;
}));
