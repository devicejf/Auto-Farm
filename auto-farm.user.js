// ==UserScript==
// @name         2 DEVICE AUTO-FARM
// @namespace    Device
// @version      1
// @description  Não farma acima de 85% da capacidade do armazem
// @version      2.0
// @description  Não farma acima de 85% da capacidade do armazem, integrado com a Central de Fluxo (Humanizer).
// @author       Device Grepolis
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @require      https://raw.githubusercontent.com/devicejf/Humanizer/main/humanizer.js
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

var uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
var FIXED_INTERVAL = (10 * 60 * 1000) + 5000; // 10 minutos e 5 segundos exatos
var STORAGE_LIMIT_PERCENT = 0.85; // Limite de 85% para todos os recursos
@@ -88,7 +91,7 @@
{ name: '🌍 Mundo', value: '`' + worldDisplay + '`', inline: true },
{ name: '👤 Jogador Afetado', value: '`' + playerName + '`', inline: true },
{ name: '🆔 ID da Conta', value: '`' + playerId + '`', inline: true },
                    { name: '⚙️ Módulo Responsável', value: '`1111 DEVICE AUTO-FARM`', inline: false },
                    { name: '⚙️ Módulo Responsável', value: '`2 DEVICE AUTO-FARM`', inline: false },
{ name: '⚠️ Ação Necessária', value: 'Abra a aba do jogo **imediatamente**, resolva o hCaptcha de forma manual e só depois reative as automações.', inline: false }
],
footer: { text: 'Device Security Systems • Proteção Antiban' },
@@ -103,7 +106,7 @@
};

AutoFarmHeadless.prototype.init = function () {
        console.log('%c[AutoFarm v3.9.0] Ativado (Independente + Intervalo Fixo 10m05s).', 'color: #8bc34a; font-weight: bold;');
        console.log('%c[AutoFarm v4.0 - Centralized] Ativado com Prioridade Máxima na Central.', 'color: #8bc34a; font-weight: bold;');
this.scheduleNextRun(5000);
};

@@ -130,21 +133,37 @@
}
};

    // INTEGRAÇÃO COM A CENTRAL: O ciclo inteiro é englobado pela prioridade máxima
AutoFarmHeadless.prototype.executeFarm = async function () {
if (this.running) return;
        
        if (uw.DeviceCentral && uw.DeviceCentral.isBlocked && uw.DeviceCentral.isBlocked()) {
            this.scheduleNextRun(30000);
            return;
        }

if (this.isCaptchaActive()) {
this.scheduleNextRun(30000);
return;
}

this.running = true;
        try {

        // Se a central existir, solicita prioridade máxima para executar o farm completo
        if (uw.DeviceCentral && typeof uw.DeviceCentral.executeFarmPriority === 'function') {
            await uw.DeviceCentral.executeFarmPriority(async () => {
                await this.claim();
            });
        } else {
            // Fallback caso a central demore a carregar
await this.claim();
        } catch (e) {
        } finally {
            this.running = false;
            // Agenda exatamente 10 minutos e 5 segundos após a conclusão total da coleta
            this.scheduleNextRun(FIXED_INTERVAL);
}

        this.running = false;
        
        // ⏱️ O temporizador fixo (10 min e 5 seg) SÓ É CONTADO AQUI, após a última aldeia do ciclo ser processada!
        console.log(`[Auto-Farm] Ciclo completo encerrado. Próxima execução em 10 minutos e 5 segundos.`);
        this.scheduleNextRun(FIXED_INTERVAL);
};

AutoFarmHeadless.prototype.generateList = function () {
@@ -173,6 +192,7 @@
try { captain = uw.GameDataPremium.isAdvisorActivated('captain'); } catch (e) {}
var towns = this.generateList();
if (towns.length === 0) return;
        
if (captain) {
await this.claimMultiple(towns, 300, 600);
} else {
