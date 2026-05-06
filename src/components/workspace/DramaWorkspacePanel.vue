<template>
  <aside class="drama-workspace">
    <div class="dws-header">
      <div>
        <p class="dws-tag">YUFENG Drama Workspace</p>
        <h3 class="dws-title">短剧工作区</h3>
      </div>
      <div class="dws-header-actions">
        <span class="dws-badge">{{ shotList.length }} 镜头</span>
        <button class="dws-close" @click="$emit('close')">收起</button>
      </div>
    </div>

    <div class="dws-tabs">
      <button v-for="tab in tabs" :key="tab.id" class="dws-tab" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}</button>
    </div>

    <div class="dws-body">
      <!-- 设定 -->
      <section v-if="activeTab === 'premise'" class="dws-section">
        <label class="dws-label">故事概要</label>
        <textarea v-model="localPremise" class="dws-textarea" rows="4" placeholder="描述你的短剧创意..." @blur="savePremise" />
        <div class="dws-row">
          <div class="dws-field">
            <label class="dws-label">题材</label>
            <select v-model="localGenre" class="dws-select" @change="savePremise">
              <option value="">未设定</option>
              <option v-for="g in genreOptions" :key="g" :value="g">{{ g }}</option>
            </select>
          </div>
          <div class="dws-field">
            <label class="dws-label">风格</label>
            <select v-model="localStyle" class="dws-select" @change="savePremise">
              <option v-for="s in styleOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 角色 -->
      <section v-if="activeTab === 'characters'" class="dws-section">
        <div class="dws-toolbar">
          <strong>角色库</strong>
          <button class="dws-btn-sm" @click="handleAddCharacter">+ 添加角色</button>
        </div>
        <div class="dws-cards">
          <div v-for="char in characters" :key="char.id" class="dws-card" :class="{ editing: editingId === char.id }">
            <div v-if="editingId !== char.id" class="dws-card-body">
              <b class="dws-card-name">{{ char.name || '未命名' }}</b>
              <span class="dws-card-role">{{ char.role }}</span>
              <p class="dws-card-desc">{{ char.appearance || '无外貌描述' }}</p>
              <div class="dws-card-actions">
                <button class="dws-btn-xs" @click="startEditChar(char)">编辑</button>
                <button class="dws-btn-xs del" @click="handleRemoveCharacter(char.id)">删除</button>
              </div>
            </div>
            <div v-else class="dws-card-edit">
              <input v-model="editForm.name" class="dws-input" placeholder="角色名" />
              <select v-model="editForm.role" class="dws-select">
                <option value="主角">主角</option><option value="配角">配角</option><option value="群众">群众</option>
              </select>
              <textarea v-model="editForm.appearance" class="dws-textarea" rows="2" placeholder="外貌描述" />
              <textarea v-model="editForm.personality" class="dws-textarea" rows="2" placeholder="性格描述" />
              <div class="dws-card-actions">
                <button class="dws-btn-sm primary" @click="saveEditChar">保存</button>
                <button class="dws-btn-sm" @click="editingId = null">取消</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 场景 -->
      <section v-if="activeTab === 'scenes'" class="dws-section">
        <div class="dws-toolbar">
          <strong>场景库</strong>
          <button class="dws-btn-sm" @click="handleAddScene">+ 添加场景</button>
        </div>
        <div class="dws-cards">
          <div v-for="scene in scenes" :key="scene.id" class="dws-card" :class="{ editing: editingId === scene.id }">
            <div v-if="editingId !== scene.id" class="dws-card-body">
              <b class="dws-card-name">{{ scene.name || '未命名' }}</b>
              <span class="dws-card-role">{{ scene.time }}</span>
              <p class="dws-card-desc">{{ scene.prompt || scene.location || '无描述' }}</p>
              <div class="dws-card-actions">
                <button class="dws-btn-xs" @click="startEditScene(scene)">编辑</button>
                <button class="dws-btn-xs del" @click="handleRemoveScene(scene.id)">删除</button>
              </div>
            </div>
            <div v-else class="dws-card-edit">
              <input v-model="editForm.name" class="dws-input" placeholder="场景名" />
              <input v-model="editForm.location" class="dws-input" placeholder="具体地点" />
              <select v-model="editForm.time" class="dws-select">
                <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
              <textarea v-model="editForm.prompt" class="dws-textarea" rows="2" placeholder="场景视觉描述" />
              <div class="dws-card-actions">
                <button class="dws-btn-sm primary" @click="saveEditScene">保存</button>
                <button class="dws-btn-sm" @click="editingId = null">取消</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 分集 -->
      <section v-if="activeTab === 'episodes'" class="dws-section">
        <div class="dws-toolbar">
          <strong>分集</strong>
          <button class="dws-btn-sm" @click="handleAddEpisode">+ 添加分集</button>
        </div>
        <div v-for="ep in episodes" :key="ep.id" class="dws-ep-row">
          <span class="dws-ep-index">第{{ ep.index }}集</span>
          <input v-model="ep.title" class="dws-input flex-1" @blur="emitProjectUpdate" />
          <button class="dws-btn-xs del" @click="handleRemoveEpisode(ep.id)">删除</button>
        </div>
      </section>

      <!-- 镜头表 -->
      <section v-if="activeTab === 'shots'" class="dws-section">
        <div class="dws-toolbar">
          <strong>镜头表</strong>
          <div class="dws-toolbar-actions">
            <button class="dws-btn-sm primary" :disabled="generating" @click="handleGenerate">
              {{ generating ? '生成中...' : 'AI 生成' }}
            </button>
            <button class="dws-btn-sm" @click="handleAddShot">+ 手动添加</button>
          </div>
        </div>

        <div v-if="generating" class="dws-generating">
          <p>正在调用文本模型生成分镜...</p>
          <p class="text-xs text-white/40">生成内容和数量取决于设置 tab 中的配置</p>
        </div>

        <div v-if="!shotList.length && !generating" class="dws-empty">
          <p>还没有镜头。点击"AI 生成"或"手动添加"开始。</p>
        </div>

        <div v-for="shot in shotList" :key="shot.id" class="dws-shot-row">
          <div class="dws-shot-top">
            <span class="dws-shot-num">#{{ shot.index }}</span>
            <select class="dws-shot-scene" :value="shot.sceneId" @change="updateShotScene(shot, $event.target.value)">
              <option value="">无场景</option>
              <option v-for="s in scenes" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <select class="dws-shot-status-sel" :value="shot.status" @change="updateShotField(shot, 'status', $event.target.value)">
              <option v-for="(label, key) in DRAMA_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>

          <!-- 角色多选 -->
          <div class="dws-shot-chars">
            <span class="dws-label-inline">角色</span>
            <label v-for="c in characters" :key="c.id" class="dws-char-check">
              <input type="checkbox" :checked="(shot.characterIds || []).includes(c.id)" @change="toggleCharInShot(shot, c.id)" />
              <span>{{ c.name }}</span>
            </label>
          </div>

          <textarea class="dws-shot-desc" rows="1" :value="shot.description" @blur="updateShotField(shot, 'description', $event.target.value)" placeholder="镜头描述" />

          <div class="dws-shot-cam-row">
            <select class="dws-shot-cam-sel" :value="shot.shotType" @change="updateShotField(shot, 'shotType', $event.target.value)">
              <option value="">景别</option>
              <option v-for="st in shotTypeOptions" :key="st" :value="st">{{ st }}</option>
            </select>
            <select class="dws-shot-cam-sel" :value="shot.angle" @change="updateShotField(shot, 'angle', $event.target.value)">
              <option value="">角度</option>
              <option v-for="a in angleOptions" :key="a" :value="a">{{ a }}</option>
            </select>
            <select class="dws-shot-cam-sel" :value="shot.movement" @change="updateShotField(shot, 'movement', $event.target.value)">
              <option value="">运镜</option>
              <option v-for="m in movementOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>

          <div class="dws-shot-row-2">
            <input class="dws-shot-input" :value="shot.dialogue" @blur="updateShotField(shot, 'dialogue', $event.target.value)" placeholder="台词" />
          </div>
          <div class="dws-shot-row-2">
            <input class="dws-shot-input" :value="shot.firstFramePrompt || shot.imagePrompt" @blur="updateShotField(shot, 'firstFramePrompt', $event.target.value)" placeholder="首帧 Prompt" />
          </div>
          <div class="dws-shot-row-2">
            <input class="dws-shot-input" :value="shot.videoPrompt" @blur="updateShotField(shot, 'videoPrompt', $event.target.value)" placeholder="视频 Prompt" />
          </div>

          <div class="dws-shot-actions">
            <button class="dws-btn-xs" @click="emitAction('locateDramaShot', shot.id)">定位</button>
            <button class="dws-btn-xs" @click="emitAction('createFirstFrameWorkflow', shot.id)">首帧</button>
            <button class="dws-btn-xs" @click="emitAction('createVideoWorkflow', shot.id)">视频</button>
            <button class="dws-btn-xs" @click="emitAction('duplicateShot', { shotId: shot.id })">复制</button>
            <button class="dws-btn-xs del" @click="emitAction('removeShot', { shotId: shot.id })">删除</button>
          </div>
        </div>
      </section>

      <!-- 设置 -->
      <section v-if="activeTab === 'settings'" class="dws-section">
        <div class="dws-toolbar"><strong>生成设置</strong></div>
        <div class="dws-settings-grid">
          <div class="dws-field">
            <label class="dws-label">分镜数量</label>
            <input type="number" v-model.number="localSettings.shotCount" min="3" max="24" class="dws-input" />
          </div>
          <div class="dws-field">
            <label class="dws-label">角色数量</label>
            <input type="number" v-model.number="localSettings.characterCount" min="1" max="12" class="dws-input" />
          </div>
          <div class="dws-field">
            <label class="dws-label">场景数量</label>
            <input type="number" v-model.number="localSettings.sceneCount" min="1" max="12" class="dws-input" />
          </div>
          <div class="dws-field">
            <label class="dws-label">分集数量</label>
            <input type="number" v-model.number="localSettings.episodeCount" min="1" max="24" class="dws-input" />
          </div>
          <div class="dws-field">
            <label class="dws-label">目标时长(秒)</label>
            <input type="number" v-model.number="localSettings.targetDurationSec" min="10" max="600" class="dws-input" />
          </div>
          <div class="dws-field">
            <label class="dws-label">视频比例</label>
            <select v-model="localSettings.aspectRatio" class="dws-select">
              <option value="9:16">9:16 (竖屏)</option>
              <option value="16:9">16:9 (横屏)</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
            </select>
          </div>
          <div class="dws-field">
            <label class="dws-label">风格</label>
            <input v-model="localSettings.style" class="dws-input" placeholder="如：都市悬疑、古装言情" />
          </div>
          <div class="dws-field">
            <label class="dws-label">基调</label>
            <input v-model="localSettings.tone" class="dws-input" placeholder="如：轻松搞笑、紧张悬疑" />
          </div>
        </div>
        <button class="dws-btn-sm primary dws-mt" @click="saveSettings">保存设置</button>
        <p v-if="settingsSaved" class="dws-saved-hint">已保存</p>
      </section>
    </div>

    <!-- Error overlay -->
    <div v-if="errorMessage" class="dws-error">
      <p>{{ errorMessage }}</p>
      <div class="dws-error-actions">
        <button class="dws-btn-sm" @click="emitAction('openCloudModelSettings')">打开模型设置</button>
        <button class="dws-btn-sm" @click="errorMessage = ''">关闭</button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { currentProject, updateProject } from '@/stores/projects'
import { DRAMA_STATUS_LABELS } from '@/integrations/drama/dramaWorkspace'

const emit = defineEmits(['action', 'close'])

const tabs = [
  { id: 'premise', label: '设定' },
  { id: 'characters', label: '角色' },
  { id: 'scenes', label: '场景' },
  { id: 'episodes', label: '分集' },
  { id: 'shots', label: '镜头表' },
  { id: 'settings', label: '设置' }
]

const genreOptions = ['都市', '古装', '悬疑', '喜剧', '科幻', '奇幻', '校园', '职场', '家庭', '爱情']
const styleOptions = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: 'cinematic', label: '电影感' },
  { value: 'ghibli', label: '吉卜力' },
  { value: 'comic', label: '漫画' }
]
const timeOptions = ['清晨', '白天', '傍晚', '夜晚', '深夜']
const shotTypeOptions = ['远景', '全景', '中景', '近景', '特写']
const angleOptions = ['平视', '俯视', '仰视', '轻微俯视']
const movementOptions = ['固定镜头', '缓慢推进', '跟拍', '横移', '摇镜', '升降']

const activeTab = ref('shots')
const generating = ref(false)
const errorMessage = ref('')
const settingsSaved = ref(false)
const editingId = ref(null)
const editForm = ref({})
const editType = ref('')

const localPremise = ref('')
const localGenre = ref('')
const localStyle = ref('realistic')
const localSettings = ref({
  episodeCount: 1, shotCount: 8, characterCount: 2, sceneCount: 3,
  targetDurationSec: 60, aspectRatio: '9:16', style: '短剧', tone: '',
  firstFrameModel: '', videoModel: ''
})

const drama = computed(() => currentProject.value?.drama || {})
const characters = computed(() => Array.isArray(drama.value.characters) ? drama.value.characters : [])
const scenes = computed(() => Array.isArray(drama.value.scenes) ? drama.value.scenes : [])
const episodes = computed(() => Array.isArray(drama.value.episodes) ? drama.value.episodes : [])
const shotList = computed(() => Array.isArray(drama.value.shots) ? drama.value.shots : [])

watch(drama, (d) => {
  if (d.premise !== undefined) localPremise.value = d.premise || ''
  if (d.genre !== undefined) localGenre.value = d.genre || ''
  if (d.style !== undefined) localStyle.value = d.style || 'realistic'
  if (d.dramaGenerationSettings) {
    localSettings.value = { ...localSettings.value, ...d.dramaGenerationSettings }
  }
}, { immediate: true })

function emitAction(action, payload) { emit('action', action, payload) }

function emitProjectUpdate() {
  if (!currentProject.value) return
  updateProject(currentProject.value.id, { drama: { ...currentProject.value.drama } })
}

// Premise
function savePremise() {
  if (!currentProject.value) return
  const d = { ...currentProject.value.drama, premise: localPremise.value, genre: localGenre.value, style: localStyle.value }
  updateProject(currentProject.value.id, { drama: d })
}

// Characters — direct project mutations (no nodes involved)
function handleAddCharacter() {
  const p = currentProject.value
  if (!p) return
  const chars = p.drama.characters || []
  const now = Date.now()
  const newChar = {
    id: `char_${now}_${chars.length}`,
    name: `角色${chars.length + 1}`,
    role: '配角',
    appearance: '', personality: '', voiceStyle: '',
    seedValue: null, referenceImages: [], imageUrl: '', description: ''
  }
  updateProject(p.id, { drama: { ...p.drama, characters: [...chars, newChar] } })
}
function handleRemoveCharacter(id) {
  const p = currentProject.value
  if (!p) return
  updateProject(p.id, { drama: { ...p.drama, characters: p.drama.characters.filter(c => c.id !== id) } })
}
function startEditChar(c) {
  editingId.value = c.id
  editType.value = 'char'
  editForm.value = { name: c.name, role: c.role, appearance: c.appearance || '', personality: c.personality || '' }
}
function saveEditChar() {
  const p = currentProject.value
  if (!p) return
  const chars = p.drama.characters.map(c => c.id === editingId.value ? { ...c, ...editForm.value } : c)
  updateProject(p.id, { drama: { ...p.drama, characters: chars } })
  editingId.value = null
}

// Scenes — direct project mutations
function handleAddScene() {
  const p = currentProject.value
  if (!p) return
  const sc = p.drama.scenes || []
  const now = Date.now()
  const newScene = {
    id: `scene_${now}_${sc.length}`,
    name: `场景${sc.length + 1}`,
    location: `场景${sc.length + 1}`,
    time: '白天', prompt: '', imageUrl: '', status: 'idle'
  }
  updateProject(p.id, { drama: { ...p.drama, scenes: [...sc, newScene] } })
}
function handleRemoveScene(id) {
  const p = currentProject.value
  if (!p) return
  updateProject(p.id, { drama: { ...p.drama, scenes: p.drama.scenes.filter(s => s.id !== id) } })
}
function startEditScene(s) {
  editingId.value = s.id
  editType.value = 'scene'
  editForm.value = { name: s.name, location: s.location || '', time: s.time || '白天', prompt: s.prompt || '' }
}
function saveEditScene() {
  const p = currentProject.value
  if (!p) return
  const sc = p.drama.scenes.map(s => s.id === editingId.value ? { ...s, ...editForm.value } : s)
  updateProject(p.id, { drama: { ...p.drama, scenes: sc } })
  editingId.value = null
}

// Episodes — direct project mutations
function handleAddEpisode() {
  const p = currentProject.value
  if (!p) return
  const eps = p.drama.episodes || []
  const idx = eps.length + 1
  const now = Date.now()
  const newEp = { id: `ep_${now}_${eps.length}`, index: idx, title: `第${idx}集`, summary: '', status: 'draft' }
  updateProject(p.id, { drama: { ...p.drama, episodes: [...eps, newEp] } })
}
function handleRemoveEpisode(id) {
  const p = currentProject.value
  if (!p) return
  const eps = p.drama.episodes.filter(e => e.id !== id)
  eps.forEach((e, i) => { e.index = i + 1 })
  updateProject(p.id, { drama: { ...p.drama, episodes: eps } })
}

// Shots — ALL mutations via emit, Canvas/commands owns data + nodes
function handleAddShot() {
  emitAction('addShot', { shotData: { episodeId: episodes.value[0]?.id || '' } })
}

function handleGenerate() {
  generating.value = true
  errorMessage.value = ''
  emitAction('generateDramaShots', {
    userInput: localPremise.value || '都市短剧',
    settings: { ...localSettings.value },
    _panelCallback: (ok, error) => {
      generating.value = false
      if (!ok) errorMessage.value = error || '生成失败'
    }
  })
}

// Shot field updates — emit to Canvas, no direct data mutation
function updateShotField(shot, field, value) {
  const patch = { [field]: value }
  if (field === 'firstFramePrompt') {
    patch.imagePrompt = value
  }
  emitAction('updateShot', { shotId: shot.id, patch })
}

function updateShotScene(shot, sceneId) {
  const scene = scenes.value.find(s => s.id === sceneId)
  emitAction('updateShot', {
    shotId: shot.id,
    patch: { sceneId, location: scene?.name || '', time: scene?.time || '' }
  })
}

function toggleCharInShot(shot, charId) {
  const current = shot.characterIds || []
  const next = current.includes(charId) ? current.filter(id => id !== charId) : [...current, charId]
  emitAction('updateShot', { shotId: shot.id, patch: { characterIds: next } })
}

// Settings
function saveSettings() {
  if (!currentProject.value) return
  const d = { ...currentProject.value.drama, dramaGenerationSettings: { ...localSettings.value } }
  updateProject(currentProject.value.id, { drama: d })
  settingsSaved.value = true
  setTimeout(() => { settingsSaved.value = false }, 1500)
}
</script>

<style scoped>
.drama-workspace {
  position: absolute;
  right: 1rem;
  top: 5rem;
  z-index: 20;
  width: 340px;
  max-height: calc(100vh - 7rem);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 1.5rem;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(15,23,42,0.92);
  color: white;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  backdrop-filter: blur(16px);
}
.dws-header { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); background: linear-gradient(to right, rgba(52,211,153,0.08), transparent); }
.dws-tag { font-size: 9px; text-transform: uppercase; letter-spacing: 0.2em; color: rgba(255,255,255,0.4); margin-bottom: 2px; }
.dws-title { font-size: 14px; font-weight: 600; }
.dws-header-actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.dws-badge { font-size: 10px; background: rgba(52,211,153,0.12); color: #6ee7b7; border-radius: 999px; padding: 2px 8px; }
.dws-close { border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); font-size: 10px; padding: 4px 10px; cursor: pointer; }
.dws-close:hover { background: rgba(255,255,255,0.1); color: white; }
.dws-tabs { display: flex; gap: 2px; padding: 8px 10px 0; flex-wrap: wrap; }
.dws-tab { border: none; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5); font-size: 11px; padding: 5px 10px; border-radius: 999px; cursor: pointer; transition: all 0.15s; }
.dws-tab:hover { background: rgba(255,255,255,0.08); }
.dws-tab.active { background: #34d399; color: #020617; font-weight: 700; }
.dws-body { flex: 1; overflow-y: auto; padding: 10px 12px; }
.dws-section { display: flex; flex-direction: column; gap: 8px; }
.dws-label { font-size: 10px; color: rgba(255,255,255,0.45); display: block; margin-bottom: 2px; }
.dws-label-inline { font-size: 9px; color: rgba(255,255,255,0.35); margin-right: 4px; }
.dws-textarea { width: 100%; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; background: rgba(0,0,0,0.2); color: white; font-size: 11px; padding: 8px; resize: vertical; outline: none; font-family: inherit; }
.dws-textarea:focus { border-color: rgba(52,211,153,0.3); }
.dws-input { width: 100%; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.2); color: white; font-size: 11px; padding: 6px 8px; outline: none; }
.dws-input:focus { border-color: rgba(52,211,153,0.3); }
.dws-select { width: 100%; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(15,23,42,0.95); color: white; font-size: 11px; padding: 6px 8px; outline: none; }
.dws-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dws-field { display: flex; flex-direction: column; }
.dws-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dws-toolbar-actions { display: flex; gap: 4px; }
.dws-btn-sm { border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); font-size: 10px; padding: 5px 10px; cursor: pointer; transition: all 0.15s; }
.dws-btn-sm:hover { background: rgba(255,255,255,0.1); color: white; }
.dws-btn-sm.primary { border-color: transparent; background: #34d399; color: #020617; font-weight: 700; }
.dws-btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }
.dws-btn-xs { border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.55); font-size: 9px; padding: 3px 6px; cursor: pointer; }
.dws-btn-xs:hover { background: rgba(255,255,255,0.1); }
.dws-btn-xs.del:hover { border-color: rgba(248,113,113,0.3); color: #f87171; }
.dws-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dws-card { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.04); padding: 8px; }
.dws-card.editing { grid-column: span 2; }
.dws-card-name { font-size: 12px; display: block; }
.dws-card-role { font-size: 9px; color: rgba(255,255,255,0.35); }
.dws-card-desc { font-size: 10px; color: rgba(255,255,255,0.5); margin: 4px 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dws-card-edit { display: flex; flex-direction: column; gap: 6px; }
.dws-card-actions { display: flex; gap: 4px; margin-top: 4px; }
.dws-ep-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.dws-ep-index { font-size: 11px; color: rgba(255,255,255,0.5); white-space: nowrap; }
.flex-1 { flex: 1; }

/* Shot rows */
.dws-shot-row { border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; background: rgba(255,255,255,0.03); padding: 8px; margin-bottom: 6px; }
.dws-shot-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.dws-shot-num { font-weight: 800; font-size: 13px; color: #34d399; min-width: 24px; }
.dws-shot-scene { max-width: 90px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; background: rgba(15,23,42,0.8); color: white; font-size: 10px; padding: 2px 4px; outline: none; }
.dws-shot-status-sel { max-width: 80px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; background: rgba(15,23,42,0.8); color: white; font-size: 9px; padding: 2px 4px; outline: none; margin-left: auto; }
.dws-shot-chars { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 4px; }
.dws-char-check { display: flex; align-items: center; gap: 2px; font-size: 9px; color: rgba(255,255,255,0.55); cursor: pointer; }
.dws-char-check input { width: 11px; height: 11px; accent-color: #34d399; }
.dws-shot-desc { width: 100%; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; background: transparent; color: rgba(255,255,255,0.7); font-size: 10px; padding: 4px 6px; resize: none; outline: none; font-family: inherit; line-height: 1.3; }
.dws-shot-desc:focus { border-color: rgba(52,211,153,0.2); }
.dws-shot-cam-row { display: flex; gap: 3px; margin-top: 4px; }
.dws-shot-cam-sel { flex: 1; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; background: rgba(15,23,42,0.6); color: rgba(255,255,255,0.6); font-size: 9px; padding: 2px 4px; outline: none; }
.dws-shot-row-2 { display: flex; gap: 4px; margin-top: 4px; }
.dws-shot-input { flex: 1; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; background: transparent; color: rgba(255,255,255,0.6); font-size: 9px; padding: 3px 5px; outline: none; }
.dws-shot-input:focus { border-color: rgba(52,211,153,0.2); }
.dws-shot-actions { display: flex; gap: 3px; margin-top: 4px; flex-wrap: wrap; }

.dws-generating { text-align: center; padding: 20px; color: rgba(255,255,255,0.5); font-size: 12px; }
.dws-empty { text-align: center; padding: 16px; color: rgba(255,255,255,0.4); font-size: 11px; }
.dws-error { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(220,38,38,0.15); border-top: 1px solid rgba(248,113,113,0.2); padding: 10px 14px; backdrop-filter: blur(8px); }
.dws-error p { font-size: 11px; color: #fca5a5; margin-bottom: 6px; }
.dws-error-actions { display: flex; gap: 6px; }
.dws-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dws-mt { margin-top: 8px; }
.dws-saved-hint { font-size: 10px; color: #34d399; margin-top: 4px; }
</style>
