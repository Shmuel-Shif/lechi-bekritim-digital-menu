/**
 * Focus trap for dialogs / drawers (Tab / Shift+Tab stay inside the topmost root).
 */
(function () {
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  /** @type {{ root: Element }[]} */
  const stack = [];

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  function getFocusable(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
      if (!isVisible(el)) return false;
      let node = el.parentElement;
      while (node && node !== root) {
        if (!isVisible(node)) return false;
        node = node.parentElement;
      }
      return true;
    });
  }

  function onKeyDown(event) {
    if (event.key !== 'Tab' || !stack.length) return;
    const { root } = stack[stack.length - 1];
    if (!root || !isVisible(root)) return;

    const list = getFocusable(root);
    if (!list.length) {
      event.preventDefault();
      if (root instanceof HTMLElement) root.focus();
      return;
    }

    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    const inside = active instanceof Node && root.contains(active);

    if (event.shiftKey) {
      if (!inside || active === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (!inside || active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', onKeyDown, true);

  /**
   * @param {Element | null | undefined} root
   * @returns {() => void} release function
   */
  function activate(root) {
    if (!root) return function release() {};
    if (root instanceof HTMLElement && !root.hasAttribute('tabindex')) {
      root.setAttribute('tabindex', '-1');
    }
    const entry = { root };
    stack.push(entry);
    return function release() {
      const index = stack.lastIndexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    };
  }

  window.LechaimFocusTrap = {
    activate,
    getFocusable,
  };
})();
