// Connect the settings option button directly to the penalty confirmation gate
document.getElementById('settings-leave-game-btn').addEventListener('click', () => {
    if (state !== 'PLAY' && state !== 'PAUSE') {
        alert("No active game loop timeline is currently running!");
        return;
    }
    // Swap screens immediately over to the penalty confirmation modal warning
    changeView('confirm-quit');
    
    let warning = document.getElementById('quit-warning-text');
    let projectedQuits = activeUser.quitCount + 1;
    if (projectedQuits >= 3) {
        warning.innerHTML = `<span class="red-text"><i class="fas fa-exclamation-triangle"></i> PENALTY WARNING:</span> Leaving early from the settings module registers an infraction. Leaving now will issue a <strong>3-MINUTE LOCKOUT PENALTY</strong> instantly!`;
    } else {
        warning.innerHTML = `Are you sure you want to abandon this simulation timeline from settings? (Infractions registered: ${activeUser.quitCount}/2 free allowances left).`;
    }
});