// remove-br-tags-extension/index.js (回退到简单CSS控制版本)

// 插件名称，用于localStorage键和路径
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// 使用一个新的localStorage键，与之前所有复杂版本的设置隔离
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-simple-v1`;

// 插件的默认设置对象
const defaultSettings = {
    hideBrInChat: false,    // 是否隐藏聊天消息中的 <br>
    hideBrGlobal: false,    // 是否隐藏全局的 <br> (谨慎使用)
};

// 用于动态添加/移除CSS规则的 <style> 标签的ID
const STYLE_TAG_ID = `${extensionName}-dynamic-styles`;

// --- 插件当前的设置状态 ---
let currentSettings = loadSettingsFromLocalStorage();

/**
 * 从localStorage加载插件的设置。
 * @returns {object} 加载到的或默认的插件设置对象。
 */
function loadSettingsFromLocalStorage() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            // 合并已存储的设置和默认设置
            return { ...defaultSettings, ...parsedSettings };
        }
    } catch (error) {
        console.error(`[${extensionName}] 从localStorage加载设置时出错:`, error);
    }
    return { ...defaultSettings }; // 返回默认设置的副本
}

/**
 * 将当前的插件设置保存到localStorage。
 * @param {object} settings 要保存的设置对象。
 */
function saveSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error(`[${extensionName}] 保存设置到localStorage时出错:`, error);
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 ${extensionName} 保存设置失败。`, "存储错误");
        }
    }
}

/**
 * 根据当前设置，更新页面上动态添加的<style>标签中的CSS规则。
 */
function applyCssVisibilityRules() {
    const settings = currentSettings;
    let cssRules = "";

    // 定义聊天消息容器的选择器 (可以根据SillyTavern的实际情况调整)
    const chatMessageSelectors = [
        '.mes_text',
        '.mes .force-user-msg .mes_text',
        '.mes .force-char-msg .mes_text',
        'div[id^="chatMessage"] .mes_text',
        '.message-content',
        '.chitchat-text' // 备用选择器
    ].join(', ');

    // 规则1: 控制全局的 <br> (如果启用，则优先于聊天区规则)
    if (settings.hideBrGlobal) {
        cssRules += `body br { display: none !important; }\n`;
    }
    // 规则 2: 控制聊天消息中的 <br> (仅当全局隐藏未启用时，此规则的"显示"部分才有意义)
    else if (settings.hideBrInChat) { // 注意这里是 else if
        cssRules += `${chatMessageSelectors} br { display: none !important; }\n`;
    }

    // (可选) 如果两个都不隐藏，我们不需要添加 "display: revert" 规则，
    // 因为移除之前的隐藏规则就等同于恢复默认显示。
    // 但如果想明确恢复，可以添加：
    // else {
    //    cssRules += `${chatMessageSelectors} br { display: revert !important; }\n`;
    //    cssRules += `body br { display: revert !important; }\n`; // 确保全局的也恢复
    // }
    // 简单起见，我们只在需要隐藏时添加规则。

    // 获取或创建 <style> 标签
    let styleTag = document.getElementById(STYLE_TAG_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = STYLE_TAG_ID;
        styleTag.type = 'text/css';
        document.head.appendChild(styleTag);
        // console.log(`[${extensionName}] 动态 <style> 标签已创建。`);
    }

    // 更新 <style> 标签的内容
    if (styleTag.textContent !== cssRules) {
        styleTag.textContent = cssRules;
        // console.log(`[${extensionName}] CSS规则已应用:`, cssRules.trim() === "" ? "无规则 (清除)" : cssRules);
    }
}

/**
 * 更新设置界面中的复选框状态，以匹配当前加载的插件设置。
 */
function updateUIFromSettings() {
    const s = currentSettings;
    $('#st-br-chat-hide').prop('checked', s.hideBrInChat);    // 对应 settings.html 中的ID
    $('#st-br-global-hide').prop('checked', s.hideBrGlobal);  // 对应 settings.html 中的ID
    // console.log(`[${extensionName}] UI已根据设置更新。`);
}

/**
 * 当设置界面中的任何一个复选框状态改变时被调用。
 * @param {Event} event - DOM事件对象。
 */
function onSettingsChange(event) {
    const targetId = event.target.id;
    const checked = Boolean(event.target.checked);

    switch (targetId) {
        case 'st-br-chat-hide':   // 对应 settings.html 中的ID
            currentSettings.hideBrInChat = checked;
            break;
        case 'st-br-global-hide': // 对应 settings.html 中的ID
            currentSettings.hideBrGlobal = checked;
            if (checked && typeof toastr !== 'undefined') {
                toastr.warning("全局隐藏 <br> 已启用。这可能影响页面布局，请谨慎使用。", "全局BR隐藏警告", { timeOut: 7000, preventDuplicates: true });
            }
            break;
        default:
            // console.warn(`[${extensionName}] 未知的设置ID发生改变: ${targetId}`);
            return;
    }

    saveSettingsToLocalStorage(currentSettings); // 保存设置
    applyCssVisibilityRules();                   // 应用新的CSS规则
    // console.log(`[${extensionName}] 设置已更改，CSS规则已重新应用。`, currentSettings);
}

// --- 初始化 ---
jQuery(async () => {
    try {
        // 1. 加载设置界面的HTML内容
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);

        // 2. 将HTML附加到SillyTavern的扩展设置区域
        const $extensionsSettingsContainer = $("#extensions_settings");
        if ($extensionsSettingsContainer.length) {
            $extensionsSettingsContainer.append(settingsHtml);
        } else {
            console.warn(`[${extensionName}] #extensions_settings 容器未找到。设置面板可能无法正确显示。`);
        }

        // 3. 为设置界面中的控件绑定事件监听器 (使用事件委托)
        // 确保 settings.html 的根 div 有 id="remove-br-tags-extension-settings-container"
        $(document).on('input', '#remove-br-tags-extension-settings-container input[type="checkbox"]', onSettingsChange);
        // (可选) 手动应用按钮，在这个简单版本中可能不是非常必要，因为CSS是即时生效的
        // $(document).on('click', '#remove-br-tags-extension-settings-container #st-br-apply-rules-now', () => {
        //     if (typeof toastr !== 'undefined') toastr.info("手动应用CSS规则...", extensionName, { timeOut: 1000 });
        //     applyCssVisibilityRules();
        // });


        // 4. 加载持久化的设置
        currentSettings = loadSettingsFromLocalStorage();
        // 5. 根据加载的设置更新UI（复选框的选中状态）
        updateUIFromSettings();
        // 6. 在插件首次加载时，立即应用一次CSS规则
        applyCssVisibilityRules();

        console.log(`[${extensionName}] 插件 (简单CSS版) 初始化成功。使用存储键: ${LOCAL_STORAGE_KEY}`);

    } catch (error) {
        console.error(`[${extensionName}] 插件初始化过程中发生严重错误:`, error, error.stack);
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`, "插件错误", { timeOut: 0 });
        }
        alert(`插件 "${extensionName}" 初始化时发生严重错误。请按F12打开浏览器控制台查看详细信息。`);
    }
});
