// Random avatar generator
const avatarStyles = ['adventurer', 'avataaars', 'bottts', 'fun-emoji', 'lorelei', 'micah', 'miniavs', 'open-peeps', 'personas', 'pixel-art'];

function getRandomAvatar(seed) {
    const style = avatarStyles[Math.abs(hashCode(seed)) % avatarStyles.length];
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// Extract AI name from system prompt
function extractAIName(systemPrompt) {
    const match = systemPrompt.match(/Assume the role of ['"]([^'"]+)['"]/i);
    if (match) {
        return match[1];
    }
    // Fallback: try to find a name in the first line
    const lines = systemPrompt.split('\n');
    if (lines[0]) {
        const nameMatch = lines[0].match(/['"]([^'"]+)['"]/);
        if (nameMatch) {
            return nameMatch[1];
        }
    }
    return 'AI Assistant';
}

// Format text with proper HTML rendering
function formatText(text) {
    if (!text) return '';
    
    // Decode unicode escape sequences
    let formatted = text;
    
    // Replace \r\n and \n with actual line breaks
    formatted = formatted.replace(/\\r\\n/g, '\n');
    formatted = formatted.replace(/\\n/g, '\n');
    formatted = formatted.replace(/\\r/g, '\n');
    
    // Decode unicode escape sequences like \uff61
    formatted = formatted.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
        return String.fromCharCode(parseInt(code, 16));
    });
    
    // Convert markdown-style bold to HTML
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert markdown-style italic (single asterisk)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Convert markdown headers
    formatted = formatted.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
    // Convert markdown lists
    formatted = formatted.replace(/^- (.+)$/gm, '• $1');
    
    // Escape HTML entities except our allowed tags
    const tempDiv = document.createElement('div');
    tempDiv.textContent = formatted;
    let escaped = tempDiv.innerHTML;
    
    // Restore our allowed HTML tags
    escaped = escaped.replace(/&lt;strong&gt;/g, '<strong>');
    escaped = escaped.replace(/&lt;\/strong&gt;/g, '</strong>');
    escaped = escaped.replace(/&lt;em&gt;/g, '<em>');
    escaped = escaped.replace(/&lt;\/em&gt;/g, '</em>');
    escaped = escaped.replace(/&lt;h2&gt;/g, '<h2>');
    escaped = escaped.replace(/&lt;\/h2&gt;/g, '</h2>');
    escaped = escaped.replace(/&lt;h3&gt;/g, '<h3>');
    escaped = escaped.replace(/&lt;\/h3&gt;/g, '</h3>');
    escaped = escaped.replace(/&lt;h4&gt;/g, '<h4>');
    escaped = escaped.replace(/&lt;\/h4&gt;/g, '</h4>');
    
    return escaped;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global state
let conversations = [];
let filteredConversations = [];
let currentConversation = null;
let currentSystemPrompt = '';
let currentAIName = '';

// Load JSONL file
async function loadConversations() {
    try {
        // Add cache busting to avoid 304 responses
        const response = await fetch('roles.jsonl?t=' + Date.now());
        const text = await response.text();
        
        // The file format has conversations split across multiple lines:
        // Line 1: {"conversations": [{"from": "system", ...},
        // Line 2:  {"from": "human", ...},
        // Line 3:  {"from": "gpt", ...},
        // ...
        // Last line of conv: ...}]}
        // Then blank line, then next conversation (starting with space {"conversations")
        
        const lines = text.split('\n');
        conversations = [];
        
        let currentBlock = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Start of a new conversation (may or may not have leading space)
            if (trimmedLine.startsWith('{"conversations":')) {
                // If we have a previous block, parse it first
                if (currentBlock) {
                    parseAndAddConversation(currentBlock);
                }
                currentBlock = trimmedLine;
            }
            // Continuation line - message object
            else if (trimmedLine.startsWith('{"from":')) {
                currentBlock += trimmedLine;
            }
            // Empty line - could signal end but we check on next iteration
            else if (trimmedLine === '') {
                // Do nothing, we'll parse when we see next conversation start
            }
        }
        
        // Don't forget the last block
        if (currentBlock) {
            parseAndAddConversation(currentBlock);
        }
        
        filteredConversations = [...conversations];
        renderConversationsList();
        console.log(`Loaded ${conversations.length} conversations`);
    } catch (error) {
        console.error('Error loading conversations:', error);
        document.getElementById('conversationsList').innerHTML = 
            '<div class="no-results">Error loading conversations. Make sure the JSONL file is in the same directory.</div>';
    }
}

function parseAndAddConversation(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        const convos = data.conversations || [];
        
        // Get system prompt
        const systemMsg = convos.find(c => c.from === 'system');
        const systemPrompt = systemMsg ? systemMsg.value : '';
        
        // Extract AI name
        const aiName = extractAIName(systemPrompt);
        
        // Get first GPT message for preview
        const firstGPT = convos.find(c => c.from === 'gpt');
        const preview = firstGPT ? firstGPT.value.substring(0, 100) : 'No messages';
        
        // Filter out system messages for display
        const messages = convos.filter(c => c.from !== 'system');
        
        conversations.push({
            id: conversations.length,
            aiName,
            systemPrompt,
            preview,
            messages,
            searchText: convos.map(c => c.value).join(' ').toLowerCase()
        });
    } catch (e) {
        console.error('Error parsing conversation:', e, jsonStr.substring(0, 100));
    }
}

// Render conversations list
function renderConversationsList() {
    const container = document.getElementById('conversationsList');
    
    if (filteredConversations.length === 0) {
        container.innerHTML = '<div class="no-results">No conversations found</div>';
        return;
    }
    
    container.innerHTML = filteredConversations.map((conv, idx) => `
        <div class="conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}" 
             onclick="selectConversation(${conv.id})">
            <img class="conversation-avatar" src="${getRandomAvatar(conv.aiName + conv.id)}" alt="">
            <div class="conversation-content">
                <div class="conversation-header">
                    <span class="conversation-name">${escapeHtml(conv.aiName)}</span>
                </div>
                <div class="conversation-preview">${escapeHtml(conv.preview.substring(0, 50))}...</div>
            </div>
            ${idx % 3 === 0 ? '<span class="unread-dot"></span>' : ''}
        </div>
    `).join('');
}

// Check if mobile view
function isMobile() {
    return window.innerWidth <= 768;
}

// Show chat view (for mobile)
function showChatView() {
    if (isMobile()) {
        document.querySelector('.sidebar').classList.add('hidden');
        document.getElementById('chatArea').classList.remove('hidden');
    }
}

// Show sidebar view (for mobile)
function showSidebarView() {
    if (isMobile()) {
        document.querySelector('.sidebar').classList.remove('hidden');
        document.getElementById('chatArea').classList.add('hidden');
    }
}

// Go back to conversations list (mobile)
function goBack() {
    showSidebarView();
}

// Select conversation
function selectConversation(id) {
    currentConversation = conversations.find(c => c.id === id);
    if (!currentConversation) return;
    
    currentSystemPrompt = currentConversation.systemPrompt;
    currentAIName = currentConversation.aiName;
    
    renderConversationsList();
    renderChat();
    showChatView();
}

// Render chat area
function renderChat() {
    const chatArea = document.getElementById('chatArea');
    
    if (!currentConversation) {
        chatArea.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>Select a conversation to start viewing</p>
            </div>
        `;
        return;
    }
    
    const aiAvatar = getRandomAvatar(currentAIName + currentConversation.id);
    const userAvatar = getRandomAvatar('User' + currentConversation.id);
    
    const messagesHtml = currentConversation.messages.map(msg => {
        const isUser = msg.from === 'human';
        const avatar = isUser ? userAvatar : aiAvatar;
        const sender = isUser ? 'User' : currentAIName;
        
        return `
            <div class="message ${isUser ? 'user' : 'ai'}">
                <img class="message-avatar" src="${avatar}" alt="">
                <div class="message-wrapper">
                    <span class="message-sender">${escapeHtml(sender)}</span>
                    <div class="message-bubble">
                        <div class="message-content">${formatText(msg.value)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    chatArea.innerHTML = `
        <div class="chat-header">
            <button class="back-btn" onclick="goBack()" title="Back to conversations">←</button>
            <div class="chat-user-info">
                <img class="chat-avatar" src="${aiAvatar}" alt="">
                <div class="chat-user-details">
                    <h3>${escapeHtml(currentAIName)}</h3>
                    <span>AI Character</span>
                </div>
            </div>
            <div class="chat-user-meta">
                <span>📧 ${currentConversation.messages.length} Messages</span>
            </div>
            <div class="chat-actions" onclick="showPromptModal()" title="View System Prompt">•••</div>
        </div>
        <div class="chat-messages">
            <div class="message-date">Conversation Start</div>
            ${messagesHtml}
        </div>
    `;
}

// Show prompt modal
function showPromptModal() {
    const modal = document.getElementById('promptModal');
    const content = document.getElementById('promptContent');
    content.innerHTML = formatText(currentSystemPrompt);
    modal.classList.add('active');
}

// Close modal
function closeModal() {
    document.getElementById('promptModal').classList.remove('active');
}

// Initialize event listeners
function initEventListeners() {
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (!query) {
            filteredConversations = [...conversations];
        } else {
            filteredConversations = conversations.filter(conv => {
                return conv.searchText.includes(query) || 
                       conv.aiName.toLowerCase().includes(query);
            });
        }
        
        renderConversationsList();
    });

    // Close modal on overlay click
    document.getElementById('promptModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    });

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

// Handle window resize for responsive behavior
function handleResize() {
    const sidebar = document.querySelector('.sidebar');
    const chatArea = document.getElementById('chatArea');
    
    if (!isMobile()) {
        // Desktop: show both panels
        sidebar.classList.remove('hidden');
        chatArea.classList.remove('hidden');
    } else {
        // Mobile: show appropriate panel
        if (currentConversation) {
            sidebar.classList.add('hidden');
            chatArea.classList.remove('hidden');
        } else {
            sidebar.classList.remove('hidden');
            chatArea.classList.add('hidden');
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadConversations();
    
    // Handle window resize
    window.addEventListener('resize', handleResize);
    
    // Initial setup for mobile
    handleResize();
});
