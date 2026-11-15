// demo.js — small touches for the standalone demo.
(function () {
  'use strict';
  // "Plan our week" opened a separate team plan page in the original; here it opens the Plan tab.
  const plan = document.getElementById('open-plan');
  if (plan) plan.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = document.getElementById('tab-plan');
    if (tab) tab.click();
  });
})();
