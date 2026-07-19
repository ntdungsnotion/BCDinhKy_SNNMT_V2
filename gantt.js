const GANTT = {
    render(containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <div style="width: 100%; height: calc(100vh - 120px); background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                <div style="padding: 10px 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: #1b4332;">📊 THEO DÕI TIẾN ĐỘ CÔNG VIỆC (GANTT)</span>
                    <button class="btn-sm gr" onclick="window.open('${CONFIG.GANTT_URL.replace('/htmlembed', '/edit')}', '_blank')">
                        ↗️ Mở trong Tab mới
                    </button>
                </div>
                <iframe 
                    src="${CONFIG.GANTT_URL}" 
                    style="width: 100%; height: 100%; border: none;"
                    allowfullscreen>
                </iframe>
            </div>
        `;
    }
};