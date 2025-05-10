// SillyTavern/data/your_user_handle/extensions/br-tags-visibility/index.js
'use strict';

import { eventSource, event_types } from '../../../../script.js';
// 尝试导入SillyTavern核心功能，如果这些函数是全局可用的，则可能不需要显式导入
// 例如: SillyTavern.context, SillyTavern.renderExtensionTemplateAsync
// 如果它们不是全局的，你需要找到正确的导入路径或方式。

(function () {
    const context = SillyTavern.getContext();
    if (!context) {
        console.error("BR标签显隐控制: Failed to get SillyTavern context.");
        return;
    }
    const { extensionSettings, registerExtensionSettings generazioneHtml, getExtensionSettingsNode } = context;

    const MODULE_NAME = 'brTagsVisibilityExtension';
    const EXTENSION_NAME = 'br-tags-visibility'; // 你的扩展文件夹名
    const CSS_CLASS_HIDE_CHAT_BR = 'ext-hide-chat-br-tags';
    const CSS_CLASS_HIDE_ALL_BR = 'ext-hide-all-br-tags';

    let settingsNode = null; // 用来存放设置UI的DOM节点

    function getSettings() {
        // ... (getSettings函数保持不变)
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
        // ... (applyBrVisibility函数保持不变)
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

    // 将函数暴露给 settings_display.html (如果settings_display.html中的脚本还在使用它)
    if (!window.extensions) {
        window.extensions = {};
    }
    if (!window.extensions.brTagsVisibility) {
        window.extensions.brTagsVisibility = {};
    }
    window.extensions.brTagsVisibility.applyVisibility = function(currentSettings) {
        // ... (暴露的applyVisibility函数保持不变)
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

    // 这个函数将被SillyTavern调用（或者在某个事件触发时调用）来构建设置UI
    async function buildSettingsUI() {
        if (!SillyTavern.renderExtensionTemplateAsync) {
            console.error(`${EXTENSION_NAME}: SillyTavern.renderExtensionTemplateAsync is not available.`);
            return null; // 或者返回一个错误提示的HTML
        }

        try {
            // SillyTavern的renderExtensionTemplateAsync期望的路径可能是相对于public目录的
            // 如果你的扩展在 data/user/extensions/ 目录下，路径可能需要调整
            // 'third-party/' 前缀通常用于 public/scripts/extensions/third-party/ 下的扩展
            // 对于 data/ 目录下的扩展，路径可能直接是扩展名
            // 检查SillyTavern文档或工作示例以确定正确路径格式
            // 假设对于 data/ 目录下的扩展，可以直接用扩展名
            const templatePath = EXTENSION_NAME; // 或者可能是 `extensions/${EXTENSION_NAME}`
            const settingsHtml = await SillyTavern.renderExtensionTemplateAsync(templatePath, 'settings_display');

            // 创建一个 div 来容纳 HTML，并允许 settings_display.html 中的脚本执行
            const container = document.createElement('div');
            container.innerHTML = settingsHtml;

            // 重新执行 settings_display.html 中内联的 <script> 标签
            // 注意：这是一种常见但有时复杂的处理方式。SillyTavern自身可能有更优雅的机制。
            Array.from(container.querySelectorAll("script")).forEach(oldScript => {
                const newScript = document.createElement("script");
                Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });

            return container;
        } catch (error) {
            console.error(`${EXTENSION_NAME}: Failed to load or render settings_display.html:`, error);
            const errorDiv = document.createElement('div');
            errorDiv.textContent = 'Error loading settings UI for BR Tags Visibility.';
            errorDiv.style.color = 'red';
            return errorDiv;
        }
    }

    // 注册设置UI生成函数
    // SillyTavern 应该提供一个方法来注册这个回调
    // 示例：SillyTavern.registerExtensionSettingsPanel(EXTENSION_NAME, buildSettingsUI);
    // 或者，如果它提供一个容器节点：
    if (typeof getExtensionSettingsNode === 'function') {
        settingsNode = getExtensionSettingsNode(EXTENSION_NAME); // 获取SillyTavern为这个扩展准备的设置容器
        if (settingsNode) {
            buildSettingsUI().then(uiElement => {
                if (uiElement) {
                    settingsNode.appendChild(uiElement);
                    console.log(`${EXTENSION_NAME}: Settings UI injected into provided node.`);
                }
            }).catch(error => {
                console.error(`${EXTENSION_NAME}: Error building and injecting settings UI:`, error);
                if(settingsNode) settingsNode.textContent = 'Error loading settings.';
            });
        } else {
            console.warn(`${EXTENSION_NAME}: Could not get a settings node from SillyTavern.`);
        }
    } else if (typeof registerExtensionSettings === 'function') { // 假设有这样的注册函数
         registerExtensionSettings(EXTENSION_NAME, {
            name: 'BR标签显隐控制', // 显示在设置列表中的名字
            contentBuildFunction: buildSettingsUI, // SillyTavern会调用这个函数
         });
         console.log(`${EXTENSION_NAME}: Settings UI build function registered.`);
    }
     else {
        console.warn(`${EXTENSION_NAME}: No known mechanism to register or inject settings UI.`);
        // 作为最后的手段，如果知道固定的目标容器ID，并且上述机制都没有
        // (不推荐，因为这使得扩展与SillyTavern的UI结构紧密耦合)
        // const targetContainer = document.getElementById('extensions_settings_specific_area_for_br-tags-visibility');
        // if (targetContainer) {
        // buildSettingsUI().then(uiElement => targetContainer.appendChild(uiElement));
        // }
    }


    eventSource.on(event_types.SETTINGS_UPDATED, function() {
        applyBrVisibility();
    });

    applyBrVisibility();

    console.log(`SillyTavern Extension: ${EXTENSION_NAME} (BR标签显隐控制) 已加载。`);

})();
