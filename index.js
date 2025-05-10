// SillyTavern/data/your_user_handle/extensions/remove-br-tags/index.js
'use strict';

import { eventSource, event_types } from '../../../../script.js';

(function () {
    const context = SillyTavern.getContext();
    const { extensionSettings } = context;

    const MODULE_NAME = 'brTagsVisibilityExtension'; // 与settings_display.html中保持一致
    const CSS_CLASS_HIDE_CHAT_BR = 'ext-hide-chat-br-tags';
    const CSS_CLASS_HIDE_ALL_BR = 'ext-hide-all-br-tags';

    function getSettings() {
        const defaultSettings = {
            hideChatBr: false,
            hideAllBr: false
        };
        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = { ...defaultSettings };
        }
        for (const key in defaultSettings) {
            if (typeof extensionSettings[MODULE_NAME][key] === 'undefined') {
                extensionSettings[MODULE_NAME][key] = defaultSettings[key];
            }
        }
        return extensionSettings[MODULE_NAME];
    }

    // 应用或移除CSS类以控制<br>标签的可见性
    function applyBrVisibility() {
        const settings = getSettings();
        // console.log(`[BR Tags Ext] Applying visibility. Settings:`, settings);

        // 优先处理 "隐藏整个界面" 的设置
        if (settings.hideAllBr) {
            document.body.classList.add(CSS_CLASS_HIDE_ALL_BR);
            // 如果隐藏了所有BR，则无需再处理聊天BR的类（因为它会被全局的覆盖）
            // 但为了清晰，可以移除聊天专用的类，或者让CSS优先级处理
            document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
        } else {
            // 如果不隐藏整个界面的BR，则移除全局隐藏类
            document.body.classList.remove(CSS_CLASS_HIDE_ALL_BR);

            // 然后再根据 "隐藏聊天消息中的BR" 设置处理
            if (settings.hideChatBr) {
                document.body.classList.add(CSS_CLASS_HIDE_CHAT_BR);
            } else {
                document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
            }
        }
    }

    // 将函数暴露给 settings_display.html
    if (!window.extensions) {
        window.extensions = {};
    }
    // 使用新的模块名作为键
    if (!window.extensions.brTagsVisibility) {
        window.extensions.brTagsVisibility = {};
    }
    // 暴露的函数现在接收整个settings对象，或者也可以分别暴露
    window.extensions.brTagsVisibility.applyVisibility = function(currentSettings) {
        // console.log(`[BR Tags Ext] applyVisibility called directly with settings:`, currentSettings);
        // 可以直接使用传入的settings，或者重新获取一次以确保最新
        // applyBrVisibility(); // 重新获取会更保险，但传入的也应该是最新的

        // 为了立即响应settings_display.html的调用，我们直接用传入的currentSettings
        if (currentSettings.hideAllBr) {
            document.body.classList.add(CSS_CLASS_HIDE_ALL_BR);
            document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
        } else {
            document.body.classList.remove(CSS_CLASS_HIDE_ALL_BR);
            if (currentSettings.hideChatBr) {
                document.body.classList.add(CSS_CLASS_HIDE_CHAT_BR);
            } else {
                document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
            }
        }
    };

    eventSource.on(event_types.SETTINGS_UPDATED, function() {
        // console.log("[BR Tags Ext] SETTINGS_UPDATED event received.");
        applyBrVisibility(); // 当任何设置保存时，重新应用所有BR可见性规则
    });

    // 扩展首次加载时，应用一次当前的设置状态
    applyBrVisibility();

    console.log("SillyTavern Extension: BR标签显隐控制 已加载。");

})();