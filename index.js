<!-- remove-br-tags-extension/settings.html -->
<div id="remove-br-tags-extension-settings-container" class="br-tags-control-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>BR标签清理器</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <p>清理聊天消息中多余的换行（<br>标签）。</p>

            <div class="br-tags-control_block flex-container">
                <input id="st-br-enable-cleanup" type="checkbox" />
                <label for="st-br-enable-cleanup">启用BR清理功能</label>
            </div>
            <small>总开关。关闭此项则不进行任何<br>处理。</small>

            <hr class="sysHR" />

            <fieldset>
                <legend>清理规则 (仅当上方总开关启用时生效):</legend>
                <div class="br-tags-control_block flex-container">
                    <input id="st-br-keep-between-text" type="checkbox" />
                    <label for="st-br-keep-between-text">保留文本之间的单个<br></label>
                </div>
                <small>尝试保留用于分隔文本段落的单个换行，例如 "文本A<br>文本B" 中的<br>。</small>

                <div class="br-tags-control_block flex-container">
                    <input id="st-br-hide-leading-br" type="checkbox" />
                    <label for="st-br-hide-leading-br">隐藏消息开头的多余<br></label>
                </div>
                <small>移除消息内容最开始的换行，包括某些特殊标签（如状态标签）后紧跟的换行。</small>
            </fieldset>
            
            <hr class="sysHR" />
            <button id="st-br-apply-rules-now" class="menu_button">立即应用当前规则</button>
            <small>
                更改设置后规则会自动应用。
                此按钮用于在需要时手动强制刷新规则的执行。
            </small>
        </div>
    </div>
</div>
