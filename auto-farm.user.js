// ==UserScript==
// @name         2 DEVICE AUTO-FARM
// @namespace    Device
// @version      2.1
// @description  Não farma acima de 85% da capacidade do armazem, totalmente integrado com a Central de Fluxo (Humanizer).
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
    const MODULE_NAME = "AutoFarm";

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

    // Centraliza a verificação de bloqueio consultando o DeviceCentral
    AutoFarmHeadless.prototype.isBlocked = function () {
        if (uw.DeviceCentral && typeof uw.DeviceCentral.isBlocked === 'function') {
            return uw.DeviceCentral.isBlocked();
        }
        // Fallback local caso a central demore
        const captchaContainer = document.getElementById('hcaptcha-container');
        const botCheckModal = document.querySelector('.bot_check, .bot_check_window, iframe[src*="hcaptcha"]');
        const gameBotCheck = uw.BotCheck && typeof uw.BotCheck.isBotCheckActive === 'function' ? uw.BotCheck.isBotCheckActive() : false;
        return !!(captchaContainer || botCheckModal || gameBotCheck);
    };

    AutoFarmHeadless.prototype.init = function () {
        console.log(`%c[${MODULE_NAME} v2.1 - Centralized] Ativado e sincronizado com o Humanizer.`, 'color: #8bc34a; font-weight: bold;');
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

    // INTEGRAÇÃO COM A CENTRAL: O ciclo inteiro é englobado pela prioridade máxima
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

        // Se a central existir, solicita prioridade máxima para executar o farm completo
        if (uw.DeviceCentral && typeof uw.DeviceCentral.executeFarmPriority === 'function') {
            await uw.DeviceCentral.executeFarmPriority(async () => {
                await this.claim();
            });
        } else {
            // Fallback caso a central demore a carregar
            await this.claim();
        }

        this.running = false;
        
        // ⏱️ O temporizador fixo (10 min e 5 seg) SÓ É CONTADO AQUI, após a última aldeia do ciclo ser processada!
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
        } catch (e) {}
        return townsList;
    };

    AutoFarmHeadless.prototype.claim = async function () {
        var captain = false;
        try { captain = uw.GameDataPremium.isAdvisorActivated('captain'); } catch (e) {}
        var towns = this.generateList();
        if (towns.length === 0) return;
        
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
                        if (self.isBlocked()) {
                            if (uw.DeviceCentral && typeof uw.DeviceCentral.sendDiscordAlert === 'function') {
                                uw.DeviceCentral.sendDiscordAlert("CAPTCHA detectado na resposta da API múltipla de farm!");
                            }
                        }
                        resolve();
                    },
                    error: function (layout, resp) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(safety);
                        if (self.isBlocked()) {
                            if (uw.DeviceCentral && typeof uw.DeviceCentral.sendDiscordAlert === 'function') {
                                uw.DeviceCentral.sendDiscordAlert("CAPTCHA detectado no erro da API múltipla de farm!");
                            }
                        }
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
                        if (self.isBlocked()) {
                            if (uw.DeviceCentral && typeof uw.DeviceCentral.sendDiscordAlert === 'function') {
                                uw.DeviceCentral.sendDiscordAlert("CAPTCHA detectado na resposta do claim individual!");
                            }
                        }
                        resolve();
                    },
                    error: function (layout, resp) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(safety);
                        if (self.isBlocked()) {
                            if (uw.DeviceCentral && typeof uw.DeviceCentral.sendDiscordAlert === 'function') {
                                uw.DeviceCentral.sendDiscordAlert("CAPTCHA detectado no erro do claim individual!");
                            }
                        }
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
