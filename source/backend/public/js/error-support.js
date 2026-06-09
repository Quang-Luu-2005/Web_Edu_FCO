(function () {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
      return;
    }
    fn();
  }

  function showSuccessModal() {
    var modal = document.getElementById('supportSuccessModal');
    if (!modal) return;

    if (window.jQuery && window.jQuery.fn && typeof window.jQuery.fn.modal === 'function') {
      window.jQuery(modal).modal({ backdrop: 'static', keyboard: false });
      return;
    }

    modal.style.display = 'block';
    modal.classList.add('show');
    document.body.classList.add('modal-open');
  }

  onReady(function () {
    var btn = document.getElementById('support-btn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      var previousHtml = btn.innerHTML;
      var errorType = btn.getAttribute('data-error-type') || 'unknown';

      btn.disabled = true;
      btn.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Sending...';

      try {
        var response = await fetch('/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            pageUrl: window.location.href,
            errorType: errorType,
            message: 'Contact support button was clicked on the ' + errorType + ' error page'
          })
        });

        var payload = {};
        try {
          payload = await response.json();
        } catch (e) {}

        if (!response.ok || !payload.ok) {
          throw new Error(payload.msg || 'Cannot send support ticket');
        }

        showSuccessModal();
        window.setTimeout(function () {
          window.location.href = '/';
        }, 1800);
      } catch (err) {
        window.alert('Khong the gui phieu ho tro. Vui long thu lai.');
        btn.disabled = false;
        btn.innerHTML = previousHtml;
      }
    });
  });
})();
