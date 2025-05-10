// SillyTavern/data/your_user_handle/extensions/br-tags-visibility/index.js
'use strict';

import { eventSource, event_types } from '../../../../script.js';

(function () {
    // 确保SillyTavern上下文和jQuery在执行前可用
    if (!window.SillyTavern || !window.SillyTavern.getContext || !window.$) {
        console.error("BR标签显隐控制: SillyTavern context or jQuery not available.");
        // 可以在这里设置一个延时重试，或者等待某个SillyTavern加载完成的事件
        // 但更简单的是确保扩展加载顺序允许这些全局变量存在
        return;
    }

    const context = SillyTavern.getContext();
    if (!context) {
        console.error("BR标签显隐控制: Failed to get SillyTavern context.");
        return;
    }
    const { extensionSettings } = context;

    const MODULE_NAME = 'brTagsVisibilityExtension';
    const PLUGIN_NAME = 'br-tags-visibility'; // 你的扩展文件夹名
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

    function applyBrVisibility() {
        const settings = getSettings();
        if (settings.hideAllBr) {
            document.body.classList.add(CSS_CLASS_HIDE_ALL_BR);
            document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
        } else {
            document.body.classList.remove(CSS_CLASS_HIDE_ALL_BR);
            if (settings.hideChatBr) {
                document.body.classList.add(CSS_CLASS_HIDE_CHAT_BR);
            } else {
                document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
            }
        }
    }

    if (!window.extensions) {
        window.extensions = {};
    }
    if (!window.extensions.brTagsVisibility) {
        window.extensions.brTagsVisibility = {};
    }
    window.extensions.brTagsVisibility.applyVisibility = function(currentSettings) {
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

    // 函数：加载并注入设置UI
    async function loadAndInjectSettingsUI() {
        // 确保 renderExtensionTemplateAsync 函数存在
        if (typeof SillyTavern.renderExtensionTemplateAsync !== 'function') {
            console.error(`${PLUGIN_NAME}: SillyTavern.renderExtensionTemplateAsync function is not available.`);
            return;
        }

        // 确保目标容器存在
        const settingsContainer = $('#extensions_settings');
        if (!settingsContainer.length) {
            console.error(`${PLUGIN_NAME}: Target container #extensions_settings not found.`);
            // 可能SillyTavern还没有创建这个容器，需要等待或在不同事件钩子中执行
            return;
        }

        try {
            console.log(`${PLUGIN_NAME}: Attempting to load settings UI with path 'third-party/${PLUGIN_NAME}'...`);
            // 严格按照你提供的路径格式
            const settingsHtmlString = await SillyTavern.renderExtensionTemplateAsync(`third-party/${PLUGIN_NAME}`, 'settings_display');

            if (settingsHtmlString && typeof settingsHtmlString === 'string') {
                console.log(`${PLUGIN_NAME}: Settings HTML loaded successfully (length: ${settingsHtmlString.length}). Appending to #extensions_settings.`);

                // 将HTML字符串转换为DOM元素，以便jQuery的.append()能正确处理脚本
                // (jQuery的 .html() 或 .append() 对于字符串HTML通常会尝试执行脚本，但有时行为不一致)
                // 或者，更可靠的方式是先创建一个jQuery对象
                const $settingsHtml = $(settingsHtmlString);

                // 追加到目标容器
                settingsContainer.append($settingsHtml);

                // 重新执行脚本可能不是必需的，如果jQuery的append正确处理了
                // 但如果 settings_display.html 中的脚本不执行，可以取消下面的注释
                /*
                $settingsHtml.find("script").each(function() {
                    const oldScript = this;
                    const newScript = document.createElement("script");
                    Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                    console.log(`${PLUGIN_NAME}: Re-executed script from settings_display.html.`);
                });
                */

                console.log(`${PLUGIN_NAME}: Settings UI should now be visible in #extensions_settings.`);
            } else {
                console.error(`${PLUGIN_NAME}: Loaded settings HTML is empty or not a string.`);
            }
        } catch (error) {
            console.error(`${PLUGIN_NAME}: Failed to load or inject settings_display.html:`, error);
            // 可以在这里向用户显示错误，或者在 #extensions_settings 中追加一个错误消息
            settingsContainer.append(`<div style="color:red;">Error loading settings for ${PLUGIN_NAME}: ${error.message || error}</div>`);
        }
    }

    // --- 主逻辑 ---

    // 监听SillyTavern的某个事件，表示UI已准备好接受扩展设置
    // 或者，如果SillyTavern期望扩展在加载时立即注入，则直接调用
    // 例如，如果 'tavern_init_complete' 是这样一个事件：
    // eventSource.on(event_types.TAVERN_INIT_COMPLETE, loadAndInjectSettingsUI);
    // 如果没有特定的“UI就绪”事件，我们就在扩展脚本首次执行时尝试加载
    // 但这可能太早，#extensions_settings 可能还不存在。

    // 为了测试，我们直接调用。如果失败，说明调用时机不对或路径/函数问题。
    // 在实际应用中，这个调用应该在一个更合适的时机，例如当用户打开扩展设置面板时，
    // 或者SillyTavern提供一个特定的回调注册机制。
    // 如果这个扩展在SillyTavern的扩展管理界面有自己的“设置”按钮，
    // 那么点击那个按钮时，SillyTavern内部应该触发某个机制，此时才是注入的好时机。
    // **如果SillyTavern是期望在“扩展设置”面板打开时，由扩展自己填充内容，
    // 那么我们需要一个方法来知道这个面板何时打开。**

    // **折中方案：** 由于我们不知道SillyTavern确切的机制，
    // 并且你坚持用你提供的方式，我们假设这个调用在扩展加载时就是合适的。
    // 同时，我们不再依赖 manifest.json 中的 settings_display_file 字段，
    // 因为我们现在是手动加载。你可以考虑从 manifest.json 中移除它，以避免混淆。
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // DOM基本加载完成
        loadAndInjectSettingsUI();
    } else {
        // 否则等待DOM加载
        document.addEventListener('DOMContentLoaded', loadAndInjectSettingsUI);
    }


    eventSource.on(event_types.SETTINGS_UPDATED, function() {
        applyBrVisibility();
    });

    applyBrVisibility(); // 初始应用一次

    console.log(`SillyTavern Extension: ${PLUGIN_NAME} (BR标签显隐控制) 已加载，并尝试注入设置UI。`);

})();
