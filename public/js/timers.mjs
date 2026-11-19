export function initialTimer(settings) {
  return {status: 'idle', mode: settings.mode, startedAt: null, deadline: null, elapsedBefore: 0, remainingSeconds: settings.durationSeconds};
}
export function timerReading(timer, now = Date.now()) {
  const running = timer.status === 'running';
  const elapsed = timer.elapsedBefore + (running ? Math.max(0, now - timer.startedAt) / 1000 : 0);
  const remaining = running && timer.mode === 'countdown' ? Math.max(0, (timer.deadline - now) / 1000) : timer.remainingSeconds;
  return {elapsed, remaining, complete: timer.mode === 'countdown' && timer.status !== 'idle' && remaining <= 0};
}
export function timerAction(timer, action, settings, now = Date.now()) {
  const state = structuredClone(timer);
  if (action === 'reset') return initialTimer(settings);
  if (action === 'start') return {...initialTimer(settings), status: 'running', startedAt: now, deadline: settings.mode === 'countdown' ? now + settings.durationSeconds * 1000 : null};
  if (action === 'pause' && state.status === 'running') {
    const value = timerReading(state, now);
    return {...state, status: 'paused', startedAt: null, deadline: null, elapsedBefore: value.elapsed, remainingSeconds: value.remaining};
  }
  if (action === 'resume' && state.status === 'paused') {
    return {...state, status: 'running', startedAt: now, deadline: state.mode === 'countdown' ? now + state.remainingSeconds * 1000 : null};
  }
  const error = new Error('Cannot ' + action + ' a timer that is ' + state.status); error.status = 409; throw error;
}
export function formatDuration(seconds) {
  const total = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0)), s = total % 60, m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600);
  return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
