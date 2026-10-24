// What the guide remembers in the browser, without cookies: the tour seen, the tips shown. localStorage stays (until
// the person clears it), sessionStorage lasts the visit. Both may be blocked (a private window, strict settings): then
// the guide forgets, nothing more.

const PREFIX = 'mastr.';

function read(store, key) {
  try {
    return store.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(store, key, value) {
  try {
    store.setItem(PREFIX + key, value);
  } catch {
    // blocked storage: the guide may come again
  }
}

export const remembered = (key) => read(localStorage, key) === '1';
export const remember = (key) => write(localStorage, key, '1');
export const forget = (key) => {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // blocked storage
  }
};
export const thisVisit = (key) => read(sessionStorage, key) === '1';
export const rememberThisVisit = (key) => write(sessionStorage, key, '1');
