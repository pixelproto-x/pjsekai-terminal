(() => {
  "use strict";

  const form = document.getElementById("homePlayerLookup");
  const uidInput = document.getElementById("homePlayerUid");
  if (!form || !uidInput) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const playerId = uidInput.value.trim();

    if (!/^\d{1,32}$/.test(playerId)) {
      uidInput.setCustomValidity("請輸入 1～32 位數字組成的玩家 UID。");
      uidInput.reportValidity();
      return;
    }

    uidInput.setCustomValidity("");
    const profileInput = document.getElementById("mskPlayerId");
    const loadButton = document.getElementById("mskLoadPlayer");
    const profileTab = document.querySelector('[data-go="profile"]');

    if (!profileInput || !loadButton || !profileTab) {
      window.location.hash = "#profile";
      return;
    }

    profileInput.value = playerId;
    profileTab.click();
    loadButton.click();
  });

  uidInput.addEventListener("input", () => uidInput.setCustomValidity(""));
})();