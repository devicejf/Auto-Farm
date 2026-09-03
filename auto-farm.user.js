// ==UserScript==
// @name         2 DEVICE AUTO-FARM (Standalone Integrated)
// @namespace    Device
// @version      2.2
// @description  Não farma acima de 85% da capacidade do armazém, totalmente integrado com Central de Fluxo interna.
// @author       Device Grepolis
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const MODULE_NAME = "AutoFarm";
    var uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    var FIXED_INTERVAL = (10 * 60 * 1000) + 5000; // 10 minutos e 5 segundos exatos
    var STORAGE_LIMIT_PERCENT = 0.85; // Limite de 85% para todos os recursos

    // ==========================================
    // CENTRAL DE FLUXO INTERNA (Garante independência)
    // ==========================================
    class DeviceFlowManager {
        constructor() {
            this.isBusy = false;
            this.queue = [];
            this.isFarmActive = false;
        }

        isBlocked() {
            const captchaContainer = document.getElementById('hcaptcha-container');
            const botCheckModal = document.querySelector('.bot_check, .bot_check_window, iframe[src*="hcaptcha"]');
            const gameBotCheck = uw.BotCheck && typeof uw.BotCheck.isBotCheckActive === 'function' ? uw.BotCheck.isBotCheckActive() : false;
            return !!(captchaContainer || botCheckModal || gameBotCheck);
        }

        sendDiscordAlert(msg) {
            console.error(`🚨 [${MODULE_NAME}] ALERTA DE SEGURANÇA: ${msg}`);
        }

        async executeFarmPriority(farmCallback) {
            this.isFarmActive = true;
            console.log(`[${MODULE_NAME}] 🚨 Prioridade Máxima acionada: Coleta de Aldeias assumindo controle absoluto!`);
            try {
                await farmCallback();
            } catch (e) {
                console.error(`[${MODULE_NAME}] Erro durante a execução prioritária do Farm:`, e);
            }
            this.isFarmActive = false;
            console.log(`[${MODULE_NAME}] ✅ Ciclo de Farm finalizado com sucesso.`);
        }
    }

    // Inicializa a central global caso não exista
    if (!uw.DeviceCentral) {
        uw.DeviceCentral = new DeviceFlowManager();
    }

    var BlacklistManager = {
        blacklistedTowns: new Set(),
        getBlacklist: function() { return this.blacklistedTowns; },
        addTown: function(townId) { this.blacklistedTowns.add(Number(townId)); }
    };

    function waitForGame(callback) {
        var attempts = 0;
        var timer = setInterval(function () {
            attempts++;
            try {
                if (uw.MM && uw.ITowns && uw.Game && uw.gpAjax && typeof uw.$ === 'function') {
                    clearInterval(timer);
                    setTimeout(callback, 2000);
                    return;
                }
            } catch (e) {}
            if (attempts >= 120) {
                clearInterval(timer);
                console.warn(`[${MODULE_NAME}] Timeout aguardando o jogo carregar completamente.`);
            }
        }, 500);
    }

    function AutoFarmHeadless() {
        this.running = false;
        this.init();
    }

    AutoFarmHeadless.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    };

    AutoFarmHeadless.prototype.isBlocked = function () {
        if (uw.DeviceCentral && typeof uw.DeviceCentral.isBlocked === 'function') {
            return uw.DeviceCentral.isBlocked();
        }
        return false;
    };

    AutoFarmHeadless.prototype.init = function () {
        console.log(`%c[${MODULE_NAME} v2.2 - Standalone] Ativado e operando de forma autônoma.`, 'color: #8bc34a; font-weight: bold;');
        this.scheduleNextRun(5000);
    };

    AutoFarmHeadless.prototype.scheduleNextRun = function (ms) {
        var self = this;
        setTimeout(async function () { await self.executeFarm(); }, ms);
    };

    AutoFarmHeadless.prototype.isStorageFull = function (townId) {
        try {
            var townObj = uw.ITowns.getTown(townId);
            if (!townObj || typeof townObj.resources !== 'function') return false;
            var res = townObj.resources();
            if (!res) return false;
            var wood = res.wood || 0;
            var stone = res.stone || 0;
            var iron = res.iron || 0;
            var maxStorage = res.storage || 0;
            if (!maxStorage) return false;
            var limitThreshold = maxStorage * STORAGE_LIMIT_PERCENT;
            return (wood >= limitThreshold && stone >= limitThreshold && iron >= limitThreshold);
        } catch (e) {
            return false;
        }
    };

    AutoFarmHeadless.prototype.executeFarm = async function () {
        if (this.running) return;
        
        if (this.isBlocked()) {
            if (uw.DeviceCentral && typeof uw.DeviceCentral.sendDiscordAlert === 'function') {
                uw.DeviceCentral.sendDiscordAlert("CAPTCHA detectado! Ciclo de farm pausado.");
            }
            this.scheduleNextRun(30000);
            return;
        }

        this.running = true;

        if (uw.DeviceCentral && typeof uw.DeviceCentral.executeFarmPriority === 'function') {
            await uw.DeviceCentral.executeFarmPriority(async () => {
                await this.claim();
            });
        } else {
            await this.claim();
        }

        this.running = false;
        
        console.log(`[${MODULE_NAME}] Ciclo completo encerrado. Próxima execução em 10 minutos e 5 segundos.`);
        this.scheduleNextRun(FIXED_INTERVAL);
    };

    AutoFarmHeadless.prototype.generateList = function () {
        var islands = new Set();
        var townsList = [];
        var blacklisted = BlacklistManager.getBlacklist();
        try {
            var collection = uw.MM.getOnlyCollectionByName('Town');
            if (!collection || !collection.models) return townsList;
            var towns = collection.models;
            for (var i = 0; i < towns.length; i++) {
                var attributes = towns[i].attributes;
                if (!attributes) continue;
                var townId = Number(attributes.id);
                if (blacklisted.has(townId) || this.isStorageFull(townId)) continue;
                if (attributes.on_small_island || islands.has(attributes.island_id)) continue;
                islands.add(attributes.island_id);
                townsList.push(attributes.id);
            }
        } catch (e) {
            console.error(`[${MODULE_NAME}] Erro ao gerar lista de cidades:`, e);
        }
        return townsList;
    };

    AutoFarmHeadless.prototype.claim = async function () {
        var captain = false;
        try { captain = uw.GameDataPremium.isAdvisorActivated('captain'); } catch (e) {}
        var towns = this.generateList();
        if (towns.length === 0) {
            console.log(`[${MODULE_NAME}] Nenhuma cidade elegível para coleta no momento.`);
            return;
        }
        
        console.log(`[${MODULE_NAME}] Iniciando coleta para ${towns.length} cidades. Administrador Capitão ativo: ${captain}`);
        if (captain) {
            await this.claimMultiple(towns, 300, 600);
        } else {
            await this.claimWithoutCaptain(towns);
        }
        this.refreshCooldown();
    };

    AutoFarmHeadless.prototype.claimMultiple = async function (towns, base, boost) {
        var self = this;
        return new Promise(function (resolve) {
            let resolved = false;
            const safety = setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 5000);
            var data = { towns: towns, time_option_base: base, time_option_booty: boost, claim_factor: 'normal' };
            try {
                uw.gpAjax.ajaxPost('farm_town_overviews', 'claim_loads_multiple', data, false, {
                    success: function (resp) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(safety);
                        console.log(`[${MODULE_NAME}] Coleta múltipla executada com sucesso.`);
                        resolve();
                    },
                    error: function (layout, resp) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(safety);
                        console.warn(`[${MODULE_NAME}] Erro na resposta da API múltipla de farm.`);
                        resolve();
                    }
                });
            } catch (e) {
                if (!resolved) { resolved = true; clearTimeout(safety); resolve(); }
            }
        });
    };

    AutoFarmHeadless.prototype.claimWithoutCaptain = async function (towns) {
        var relationCollection = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation');
        var farmCollection = uw.MM.getOnlyCollectionByName('FarmTown');
        if (!relationCollection || !farmCollection) return;
        var relations = relationCollection.models;
        var farmTowns = farmCollection.models;
        var now = Math.floor(Date.now() / 1000);
        
        for (var i = 0; i < towns.length; i++) {
            if (this.isBlocked()) break;
            var townId = towns[i];
            if (this.isStorageFull(townId)) continue;
            var town = uw.ITowns.towns[townId];
            if (!town) continue;
            var x = town.getIslandCoordinateX();
            var y = town.getIslandCoordinateY();
            for (var f = 0; f < farmTowns.length; f++) {
                var farm = farmTowns[f];
                if (!farm || !farm.attributes || farm.attributes.island_x != x || farm.attributes.island_y != y) continue;
                for (var r = 0; r < relations.length; r++) {
                    var relation = relations[r];
                    if (!relation || !relation.attributes) continue;
                    if (farm.attributes.id == relation.attributes.farm_town_id &&
                        relation.attributes.relation_status === 1 &&
                        (relation.attributes.lootable_at === null || now >= relation.attributes.lootable_at)) {
                        await this.claimSingle(townId, relation.attributes.farm_town_id, relation.id, 1);
                        await this.sleep(500 + Math.random() * 200);
                    }
                }
            }
        }
    };

    AutoFarmHeadless.prototype.claimSingle = function (townId, farmTownId, relationId, option) {
        var self = this;
        return new Promise(function (resolve) {
            let resolved = false;
            const safety = setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 4000);
            var data = {
                model_url: 'FarmTownPlayerRelation/' + relationId,
                action_name: 'claim',
                arguments: { farm_town_id: farmTownId, type: 'resources', option: option },
                town_id: townId
            };
            try {
                uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, true, {
                    success: function (resp) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(safety);
                        resolve();
                    },
                    error: function (layout, resp) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(safety);
                        resolve();
                    }
                });
            } catch (e) {
                if (!resolved) { resolved = true; clearTimeout(safety); resolve(); }
            }
        });
    };

    AutoFarmHeadless.prototype.refreshCooldown = function () {
        setTimeout(function () {
            try {
                if (uw.WMap && uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers) {
                    uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers();
                }
            } catch (e) {}
        }, 1500);
    };

    waitForGame(function () {
        if (uw.__DEVICE_AUTOFARM_INSTANCE) return;
        uw.__DEVICE_AUTOFARM_INSTANCE = new AutoFarmHeadless();
    });
})();
