<template>
  <div class="platform-page">
    <div class="page-header"><h1>数据平台</h1><div style="display:flex;gap:8px"><button v-if="navigationHistory.length > 0" class="back-btn" @click="navigateBack"><span>←</span><span>返回</span></button></div></div>

    <!-- Main Tabs -->
    <div class="tab-container">
      <button
        v-for="tab in MAIN_TABS"
        :key="tab.key"
        :class="['tab-btn', { active: currentMainTab === tab.key }]"
        :disabled="isGraphSelectMode && tab.key !== 'literature'"
        @click="switchMainTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Parse Section -->
    <div v-show="currentMainTab === 'parse'" class="tab-content" :class="{ active: currentMainTab === 'parse' }">
      <div class="section">
        <div class="tab-container">
          <button v-for="pt in PARSE_TABS" :key="pt.key" :class="['tab-btn', { active: currentParseTab === pt.key }]" @click="currentParseTab = pt.key">{{ pt.label }}</button>
        </div>
        <div v-show="currentParseTab === 'recipe'" class="tab-content" :class="{ active: currentParseTab === 'recipe' }">
          <RecipeParserPanel :show-submit="true" :show-embedding="false" @submit="loadManageData" />
        </div>
        <div v-show="currentParseTab === 'working'" class="tab-content" :class="{ active: currentParseTab === 'working' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">⚙️</div><p style="font-size:18px;font-weight:500">工况解析功能开发中...</p></div>
        </div>
        <div v-show="currentParseTab === 'service'" class="tab-content" :class="{ active: currentParseTab === 'service' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">🔧</div><p style="font-size:18px;font-weight:500">服役解析功能开发中...</p></div>
        </div>
        <div v-show="currentParseTab === 'reconstruct'" class="tab-content" :class="{ active: currentParseTab === 'reconstruct' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">🎨</div><p style="font-size:18px;font-weight:500">重建解析功能开发中...</p></div>
        </div>
      </div>
    </div>

    <!-- Manage Section -->
    <div v-show="currentMainTab === 'manage'" class="tab-content" :class="{ active: currentMainTab === 'manage' }">
      <div class="section">
        <div class="tab-container">
          <button v-for="mt in MANAGE_TABS" :key="mt.key" :class="['tab-btn', { active: currentManageTable === mt.key }]" @click="switchManageTable(mt.key)">{{ mt.label }}</button>
        </div>
        <div class="toolbar">
          <input v-model="manageSearchFilter" type="text" placeholder="输入关键词搜索..." class="filter-input" />
          <button class="btn" @click="openAddModal()">{{ addRecordLabel }}</button>
          <button class="btn" @click="loadManageData()">刷新数据</button>
        </div>
        <DataTable ref="tableRef" :data="manageData" :table="currentManageTable" :editing-row-id="editingRowId"
          :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData" :mr-options="dataStore.allMrData"
          :pure-properties="propertiesStore.pureMaterialProperties" :test-properties="propertiesStore.testProperties"
          @start-edit="startEdit" @cancel-edit="cancelEdit" @save-edit="saveEdit" @delete="handleDelete"
          @jump-to-tab="jumpToTab" @open-create-mp="openCreateMp" @open-create-mc="openCreateMc" />
      </div>
    </div>

    <!-- Literature Section -->
    <div v-show="currentMainTab === 'literature'" class="tab-content" :class="{ active: currentMainTab === 'literature' }">
      <div class="section">
        <h2>文献库管理</h2>
        <section v-if="isGraphSelectMode" class="graph-select-panel" aria-label="知识图谱构图选择模式">
          <div>
            <span class="graph-select-panel__eyebrow">知识图谱构图选择模式</span>
            <h3>选择用于构建知识图谱的文献</h3>
            <p>仅可选择已上传附件的文献，本阶段不会调用 5001 或启动构图。</p>
          </div>
          <div class="graph-select-panel__actions">
            <strong>已选择 {{ selectedGraphDocuments.length }} 篇文献</strong>
            <button type="button" class="btn btn-secondary" :disabled="isPreparingGraph" @click="cancelGraphSelection">取消构建</button>
            <button
              type="button"
              class="btn"
              :disabled="selectedGraphDocuments.length === 0 || isPreparingGraph"
              @click="confirmGraphSelection"
            >
              {{ isPreparingGraph ? '正在准备文献...' : '使用选中文献构建图谱' }}
            </button>
            <p v-if="graphPreparationStatus" class="graph-select-panel__status" role="status">
              {{ graphPreparationStatus }}
            </p>
            <p v-if="graphPreparationError" class="graph-select-panel__error" role="alert">
              {{ graphPreparationError }}
            </p>
          </div>
        </section>
        <div class="toolbar" style="margin-bottom:24px">
          <input
            v-model="litSearchFilter"
            type="search"
            placeholder="搜索标题、作者、期刊或 DOI"
            aria-label="搜索文献"
            class="filter-input"
          />
          <select v-model="litTypeFilter" aria-label="文献类型" class="filter-input">
            <option value="">全部类型</option>
            <option v-for="option in litTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <select v-model="litYearFilter" aria-label="文献年份" class="filter-input">
            <option value="">全部年份</option>
            <option v-for="year in litYearOptions" :key="year" :value="year">
              {{ year }}
            </option>
          </select>
          <LiteraturePdfImportActions
            :busy="isImportingPdf"
            :status="pdfImportStatus"
            @file-selected="handleDirectPdfImport"
            @manual-create="openAddLitModal"
          />
          <button class="btn" @click="loadLitData()">刷新数据</button>
        </div>
        <LiteratureListStatus
          v-if="litListStatus"
          :status="litListStatus"
          @retry="loadLitData"
        />
        <div v-else class="lit-card-list">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px">
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
              <input
                type="checkbox"
                :checked="allCurrentPageLitSelected"
                :disabled="selectableCurrentPageLitIds.length === 0"
                aria-label="全选当前页文献"
                @change="toggleCurrentPageLitSelection"
              />
              <span>{{ isGraphSelectMode ? '全选当前页可构图文献' : '全选当前页' }}</span>
            </label>
            <strong style="color:var(--text-primary);font-size:14px">
              已选择 {{ selectedLitIds.size }} 篇文献
            </strong>
            <button
              v-if="selectedLitIds.size > 0"
              type="button"
              class="btn btn-secondary btn-small"
              @click="clearLitSelection"
            >
              清空选择
            </button>
          </div>
          <div v-for="lit in paginatedLitData" :key="lit.lit_id" class="card" style="margin-bottom:16px;padding:24px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <label
                style="display:flex;align-items:center;padding-top:2px"
                :style="{ cursor: isGraphSelectMode && !hasGraphAttachment(lit) ? 'not-allowed' : 'pointer' }"
                :title="isGraphSelectMode && !hasGraphAttachment(lit) ? '请先上传附件后再选择' : ''"
              >
                <input
                  type="checkbox"
                  :checked="selectedLitIds.has(lit.lit_id)"
                  :disabled="isGraphSelectMode && !hasGraphAttachment(lit)"
                  :aria-label="selectedLitIds.has(lit.lit_id) ? `取消选择 ${lit.title}` : `选择 ${lit.title}`"
                  @change="toggleLitSelection(lit)"
                />
              </label>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                  <span class="id-badge">{{ lit.lit_id }}</span>
                  <LiteratureTypeControl
                    :entry-type="lit.entry_type || ''"
                    :options="litTypeOptions"
                    :busy="confirmingLitTypeId === lit.lit_id"
                    @confirm="entryType => handleConfirmLitType(lit, entryType)"
                  />
                </div>
                <h3 style="margin-bottom:8px;color:var(--text-primary);font-size:16px">{{ lit.title }}</h3>
                <p style="color:var(--text-secondary);font-size:14px;margin-bottom:4px"><strong>作者:</strong> {{ lit.authors }}</p>
                <p v-if="lit.journal" style="color:var(--text-secondary);font-size:14px;margin-bottom:4px"><strong>期刊/会议:</strong> {{ lit.journal }}</p>
                <p v-if="lit.year" style="color:var(--text-secondary);font-size:14px;margin-bottom:4px"><strong>年份:</strong> {{ lit.year }}</p>
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0">
                <button class="btn btn-secondary btn-small" @click="openLitDetails(lit)">查看</button>
                <button class="btn btn-secondary btn-small" @click="openEditLitModal(lit)">编辑</button>
                <button class="btn btn-danger btn-small" @click="handleDeleteLit(lit)">删除</button>
              </div>
            </div>
            <LiteratureAttachmentActions :literature="lit" @upload="handleUploadAttachment" />
          </div>
          <nav
            v-if="litPagination.totalPages > 1"
            aria-label="文献列表分页"
            style="display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:8px;margin-top:20px"
          >
            <button
              type="button"
              class="btn btn-secondary btn-small"
              :disabled="litPagination.currentPage === 1"
              @click="setLitPage(litPagination.currentPage - 1)"
            >
              上一页
            </button>
            <button
              v-for="page in litPageNumbers"
              :key="page"
              type="button"
              class="btn btn-secondary btn-small"
              :aria-current="page === litPagination.currentPage ? 'page' : undefined"
              :style="page === litPagination.currentPage ? { background: 'var(--asc-primary)', color: '#fff' } : undefined"
              @click="setLitPage(page)"
            >
              {{ page }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-small"
              :disabled="litPagination.currentPage === litPagination.totalPages"
              @click="setLitPage(litPagination.currentPage + 1)"
            >
              下一页
            </button>
            <span style="color:var(--text-secondary);font-size:13px">
              共 {{ litPagination.totalItems }} 条
            </span>
          </nav>
        </div>
      </div>
    </div>

    <!-- MongoDB Section -->
    <div v-show="currentMainTab === 'mongodb'" class="tab-content" :class="{ active: currentMainTab === 'mongodb' }">
      <div class="section">
        <h2>MongoDB管理</h2>
        <p style="margin-bottom:24px;color:var(--text-secondary)">使用Mongo Express进行MongoDB数据库管理</p>
        <div style="width:100%;height:600px;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border-color)">
          <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:40px"
            :style="{ backgroundColor: mongoStatusOk === true ? 'rgba(16,185,129,.1)' : mongoStatusOk === false ? 'rgba(239,68,68,.1)' : 'transparent' }">
            <div style="font-size:72px;margin-bottom:24px">📦</div>
            <h3 style="margin-bottom:16px;color:var(--text-primary)">MongoDB连接状态</h3>
            <p style="margin-bottom:32px;color:var(--text-secondary);max-width:500px">{{ mongoStatusText }}</p>
            <button class="btn" @click="checkMongoDBStatus()" :disabled="isCheckingMongo"><span v-if="isCheckingMongo" class="loading"></span>{{ isCheckingMongo ? '检查中...' : '检查连接' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- =================== MODALS =================== -->
    <LiteratureDetailsModal
      v-if="selectedLitDetails"
      :literature="selectedLitDetails"
      :type-options="litTypeOptions"
      @close="selectedLitDetails = null"
    />
    <ResearchQuestionDialog
      :open="researchQuestionDialogOpen"
      :default-project-name="defaultGraphProjectName"
      @close="researchQuestionDialogOpen = false"
      @submit="startGraphBuild"
    />
    <div v-if="showAddMcModal" class="modal active" @click.self="showAddMcModal = false">
      <div class="modal-content" style="max-width:640px">
        <h2>添加原料数据</h2>
        <div class="form-group"><label>批次号</label><input v-model="addMcBatchNo" type="text" required /></div>
        <div class="form-group"><label>类型</label><select v-model="addMcType"><option v-for="t in MC_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option></select></div>
        <div class="form-group"><label>成分列表</label>
          <ComponentListEditor v-model="addMcComponents" table-type="mc" :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData" @open-create-mp="(i) => openCreateMp(i)" @open-create-mc="openCreateMc" />
        </div>
        <div class="modal-actions"><button class="btn" @click="submitAddMc()">保存</button><button class="btn btn-secondary" @click="showAddMcModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddMrModal" class="modal active" @click.self="showAddMrModal = false">
      <div class="modal-content" style="max-width:640px">
        <h2>添加配方数据</h2>
        <div class="form-group"><label>配方名称</label><input v-model="addMrFormulaName" type="text" required /></div>
        <div class="form-group"><label>配方类型</label><select v-model="addMrFormulaType"><option v-for="t in MR_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option></select></div>
        <div class="form-group"><label>批次号</label><input v-model="addMrBatchNo" type="text" /></div>
        <div class="form-group"><label>成分列表</label>
          <ComponentListEditor v-model="addMrComponents" table-type="mr" :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData" @open-create-mp="(i) => openCreateMp(i)" @open-create-mc="openCreateMc" />
        </div>
        <div class="modal-actions"><button class="btn" @click="submitAddMr()">保存</button><button class="btn btn-secondary" @click="showAddMrModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddMpModal" class="modal active" @click.self="showAddMpModal = false">
      <div class="modal-content" style="max-width:720px"><h2>添加物性数据</h2>
        <div class="form-group"><label>物性测量</label><PropertyMeasurementsEditor v-model="addMpProps" :definitions="propertiesStore.pureMaterialProperties" @validity-change="addMpValid = $event" /></div>
        <div class="modal-actions"><button class="btn" :disabled="!addMpValid" @click="submitAddMp()">保存</button><button class="btn btn-secondary" @click="showAddMpModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddTpModal" class="modal active" @click.self="showAddTpModal = false">
      <div class="modal-content" style="max-width:720px"><h2>添加配方测试数据</h2>
        <div class="form-group"><label>关联配方</label><FormulaSelect v-model="addTpMrId" :options="dataStore.allMrData" /></div>
        <div class="form-group"><label>测试物性</label><PropertyMeasurementsEditor v-model="addTpResults" :definitions="propertiesStore.testProperties" @validity-change="addTpValid = $event" /></div>
        <div class="modal-actions"><button class="btn" :disabled="!addTpValid" @click="submitAddTp()">保存</button><button class="btn btn-secondary" @click="showAddTpModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddFeModal" class="modal active" @click.self="showAddFeModal = false">
      <div class="modal-content"><h2>添加工况数据</h2>
        <div class="form-group"><label>工况名称</label><input v-model="addFeConditionName" type="text" required /></div>
        <div class="form-group"><label>工况参数 (JSON)</label><textarea v-model="addFeConditionParams" rows="4" placeholder='{"温度": 1450}'></textarea></div>
        <div class="form-group"><label>关联配方ID</label><input v-model="addFeMrIds" type="text" /></div>
        <div class="modal-actions"><button class="btn" @click="submitAddFe()">保存</button><button class="btn btn-secondary" @click="showAddFeModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddRuModal" class="modal active" @click.self="showAddRuModal = false">
      <div class="modal-content"><h2>添加服役数据</h2>
        <div class="form-group"><label>服役名称</label><input v-model="addRuServiceName" type="text" required /></div>
        <div class="form-group"><label>服役参数 (JSON)</label><textarea v-model="addRuServiceParams" rows="4" placeholder='{"时间": 365}'></textarea></div>
        <div class="form-group"><label>关联工况ID</label><input v-model="addRuFeIds" type="text" /></div>
        <div class="form-group"><label>关联配方ID</label><input v-model="addRuMrIds" type="text" /></div>
        <div class="modal-actions"><button class="btn" @click="submitAddRu()">保存</button><button class="btn btn-secondary" @click="showAddRuModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddLitModal" class="modal active literature-form-backdrop" @click.self="showAddLitModal = false">
      <div
        class="modal-content literature-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="literature-form-title"
      >
        <header class="literature-form-header">
          <div>
            <h2 id="literature-form-title">{{ isEditingLit ? '编辑文献信息' : '新增文献记录' }}</h2>
            <p>填写文献元数据；保存后可在文献卡片中上传附件。</p>
          </div>
          <button type="button" class="literature-form-close" aria-label="关闭文献表单" @click="showAddLitModal = false">×</button>
        </header>

        <div class="literature-form-body">
          <div class="literature-form-grid">
            <div class="form-group literature-form-full">
              <label>标题 <span class="literature-required">*</span></label>
              <input v-model="addLitForm.title" type="text" placeholder="请输入文献、专利或书籍标题" required />
            </div>
            <div class="form-group literature-form-full">
              <label>作者 <span class="literature-required">*</span></label>
              <input v-model="addLitForm.authors" type="text" placeholder="多位作者可使用分号分隔" required />
            </div>
            <div class="form-group literature-form-full">
              <label>期刊 / 会议 / 出版机构</label>
              <input v-model="addLitForm.journal" type="text" placeholder="请输入期刊、会议或出版机构名称" />
            </div>
            <div class="form-group">
              <label>文献类型</label>
              <select v-model="addLitForm.entry_type">
                <option v-for="opt in LIT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>年份</label>
              <input v-model="addLitForm.year" type="number" placeholder="例如：2025" />
            </div>
            <div class="form-group">
              <label>页码（Pages）</label>
              <input v-model="addLitForm.pages" type="text" placeholder="例如：120–136" />
            </div>
            <div class="form-group">
              <label>DOI</label>
              <input v-model="addLitForm.doi" type="text" placeholder="例如：10.1000/example" />
            </div>
            <div class="form-group literature-form-full">
              <label>摘要</label>
              <textarea v-model="addLitForm.abstract" class="literature-form-textarea" rows="4" placeholder="请输入文献摘要"></textarea>
            </div>
            <div class="form-group literature-form-full">
              <label>备注（Note）</label>
              <textarea v-model="addLitForm.note" class="literature-form-textarea literature-form-note" rows="3" placeholder="可补充来源、版本或其他说明"></textarea>
            </div>
          </div>
        </div>

        <footer class="modal-actions literature-form-actions">
          <button type="button" class="btn btn-secondary" @click="showAddLitModal = false">取消</button>
          <button type="button" class="btn" @click="submitAddLit()">{{ isEditingLit ? '更新信息' : '保存文献' }}</button>
        </footer>
      </div>
    </div>
    <div v-if="showCreateMcModal" class="modal active" @click.self="showCreateMcModal = false">
      <div class="modal-content" style="max-width:640px"><h2>新建原料数据</h2>
        <div class="form-group"><label>批次号</label><input v-model="createMcBatchNo" type="text" required /></div>
        <div class="form-group"><label>类型</label><select v-model="createMcType"><option v-for="t in MC_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option></select></div>
        <div class="form-group"><label>成分列表</label>
          <ComponentListEditor v-model="createMcComponents" table-type="mc" :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData" @open-create-mp="(i) => openCreateMp(i)" @open-create-mc="openCreateMc" />
        </div>
        <div class="modal-actions"><button class="btn" @click="submitCreateMc()">创建</button><button class="btn btn-secondary" @click="showCreateMcModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showCreateMpModal" class="modal active" @click.self="showCreateMpModal = false">
      <div class="modal-content" style="max-width:720px"><h2>{{ createMpExistingId ? '修改物性数据' : '添加物性数据' }}</h2>
        <div class="form-group"><label>物性测量</label><PropertyMeasurementsEditor v-model="createMpProps" :definitions="propertiesStore.pureMaterialProperties" @validity-change="createMpValid = $event" /></div>
        <div class="modal-actions"><button class="btn" :disabled="!createMpValid" @click="submitCreateMp()">{{ createMpExistingId ? '更新' : '保存' }}</button><button class="btn btn-secondary" @click="showCreateMpModal = false">取消</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlatformDataStore } from '../stores/data'
import { usePlatformPropertiesStore } from '../stores/properties'
import RecipeParserPanel from '../components/RecipeParserPanel.vue'
import DataTable from '../components/DataTable.vue'
import ComponentListEditor from '../components/ComponentListEditor.vue'
import PropertyMeasurementsEditor from '../components/PropertyMeasurementsEditor.vue'
import FormulaSelect from '../components/FormulaSelect.vue'
import LiteratureAttachmentActions from '../components/LiteratureAttachmentActions.vue'
import LiteratureDetailsModal from '../components/LiteratureDetailsModal.vue'
import LiteratureListStatus from '../components/LiteratureListStatus.vue'
import LiteraturePdfImportActions from '../components/LiteraturePdfImportActions.vue'
import LiteratureTypeControl from '../components/LiteratureTypeControl.vue'
import ResearchQuestionDialog from '../../features/research/ResearchQuestionDialog.vue'
import { suggestNextProjectName } from '../../features/projects/graphProjectWorkspaceModel.js'
import { startResearchBuildFromLibrary } from '../../features/research/researchQuestionWorkflow.js'
import { useGraphTaskMonitor } from '../../features/tasks/graphTaskMonitor.js'
import { create, update, remove, getAllLiterature, toLiteraturePayload } from '../api/newData'
import { removeAttachment, uploadAttachment, testMongoDB } from '../api/attachment'
import { prepareDocumentsForGraph } from '../services/graphDocumentBridge.js'
import { importLiteraturePdf } from '../services/literaturePdfImport.js'
import { deleteLiteratureWithAttachments } from '../services/literatureDeletion.js'
import { filterLiteratureByQuery, getLiteratureEntryTypes, getLiteratureYears, paginateLiterature } from '../utils/literatureSearch.js'
import { createEmptyPropertyDocument, normalizePropertyDocument } from '../utils/propertyMeasurements.js'
import {
  areAllCurrentPageLiteratureSelected,
  clearLiteratureSelection,
  removeLiteratureSelection,
  toggleCurrentPageLiteratureSelection,
  toggleLiteratureSelection,
} from '../utils/literatureSelection.js'
import { assignComponentId, MC_TYPE_OPTIONS, MR_TYPE_OPTIONS, LIT_TYPE_OPTIONS, ID_FIELD_MAP, validateComponentRows } from '../types/entities'

const MAIN_TABS = [{ key: 'parse', label: '数据解析' }, { key: 'manage', label: '数据管理' }, { key: 'literature', label: '文献库管理' }, { key: 'mongodb', label: 'MongoDB测试' }]
const PARSE_TABS = [{ key: 'recipe', label: '配方/测试解析' }, { key: 'working', label: '工况解析' }, { key: 'service', label: '服役解析' }, { key: 'reconstruct', label: '重建解析' }]
const MANAGE_TABS = [{ key: 'mc', label: '原料表' }, { key: 'mr', label: '配方表' }, { key: 'mp', label: '物性表' }, { key: 'tp', label: '测试表' }, { key: 'fe', label: '工况记录' }, { key: 'ru', label: '服役记录' }]
const ADD_RECORD_LABELS = { mp: '新建物性记录', tp: '新建测试记录' }
const LIT_TYPE_LABELS = { journal: '期刊论文', conference: '会议论文', patent: '专利', book: '书籍' }

const dataStore = usePlatformDataStore()
const propertiesStore = usePlatformPropertiesStore()
const graphTaskMonitor = useGraphTaskMonitor()
const route = useRoute()
const router = useRouter()

const currentMainTab = ref('parse')
const currentParseTab = ref('recipe')
const currentManageTable = ref('mc')
const addRecordLabel = computed(() => ADD_RECORD_LABELS[currentManageTable.value] || '添加数据')
const manageSearchFilter = ref('')
const litSearchFilter = ref('')
const litTypeFilter = ref('')
const litYearFilter = ref('')
const litCurrentPage = ref(1)
const litPageSize = 10
const selectedLitIds = ref(new Set())
const selectedLitDetails = ref(null)
const researchQuestionDialogOpen = ref(false)
const isPreparingGraph = ref(false)
const graphPreparationStatus = ref('')
const graphPreparationError = ref('')
const debouncedManageFilter = ref('')
let manageDebounceTimer = null
const isComponentMounted = ref(true)
const mongoStatusText = ref('正在检查连接...')
const mongoStatusOk = ref(null)
const isCheckingMongo = ref(false)
const editingRowId = ref(null)
const tableRef = ref(null)
const navigationHistory = ref([])
const highlightRowId = ref(null)

// Add modal states
const showAddMcModal = ref(false); const addMcBatchNo = ref(''); const addMcType = ref('支撑骨料'); const addMcComponents = ref([{ name: '新建原料', id: null, ratio: 100 }])
const showAddMrModal = ref(false); const addMrFormulaName = ref(''); const addMrFormulaType = ref('铁线配方'); const addMrBatchNo = ref(''); const addMrComponents = ref([{ name: '新建成分', id: null, ratio: 100 }])
const showAddMpModal = ref(false); const addMpProps = ref(createEmptyPropertyDocument()); const addMpValid = ref(true)
const showAddTpModal = ref(false); const addTpMrId = ref(''); const addTpResults = ref(createEmptyPropertyDocument()); const addTpValid = ref(true)
const showAddFeModal = ref(false); const addFeConditionName = ref(''); const addFeConditionParams = ref(''); const addFeMrIds = ref('')
const showAddRuModal = ref(false); const addRuServiceName = ref(''); const addRuServiceParams = ref(''); const addRuFeIds = ref(''); const addRuMrIds = ref('')
const showAddLitModal = ref(false); const isEditingLit = ref(false); const editingLitId = ref('')
const addLitForm = ref({ title: '', authors: '', journal: '', year: '', volume: '', number: '', pages: '', entry_type: 'journal', abstract: '', doi: '', note: '' })
const isImportingPdf = ref(false); const pdfImportStatus = ref('')
const confirmingLitTypeId = ref('')
const showCreateMcModal = ref(false); const createMcBatchNo = ref(''); const createMcType = ref('支撑骨料'); const createMcComponents = ref([{ name: '新建原料', id: null, ratio: 100 }])
const showCreateMpModal = ref(false); const createMpMcId = ref(''); const createMpProps = ref(createEmptyPropertyDocument()); const createMpValid = ref(true); const createMpTarget = ref(null); const createMpExistingId = ref('')

watch(manageSearchFilter, (val) => { if (manageDebounceTimer) clearTimeout(manageDebounceTimer); manageDebounceTimer = setTimeout(() => { debouncedManageFilter.value = val }, 300) })

const manageData = computed(() => {
  const all = dataStore.getDataByTable(currentManageTable.value)
  if (!debouncedManageFilter.value) return all
  const f = debouncedManageFilter.value.toLowerCase()
  return all.filter(item => Object.values(item).some(v => String(v).toLowerCase().includes(f)))
})
const litData = ref([])
const isLitLoading = ref(false)
const litLoadError = ref('')
const isGraphSelectMode = computed(() => route.query.mode === 'graph-select')
const selectedGraphDocuments = computed(() => litData.value
  .filter((lit) => selectedLitIds.value.has(lit.lit_id) && hasGraphAttachment(lit))
  .map((lit) => ({
    lit_id: lit.lit_id,
    title: lit.title,
    attachment: lit.attachment,
    entry_type: lit.entry_type,
  })))
const defaultGraphProjectName = computed(() => suggestNextProjectName(graphTaskMonitor.state.items))
const litTypeOptions = computed(() => getLiteratureEntryTypes(
  litData.value,
  LIT_TYPE_OPTIONS.map((option) => option.value),
).map((value) => ({ value, label: LIT_TYPE_LABELS[value] || value })))
const litYearOptions = computed(() => getLiteratureYears(litData.value))
const filteredLitData = computed(() => filterLiteratureByQuery(
  litData.value,
  litSearchFilter.value,
  litTypeFilter.value,
  litYearFilter.value,
))
const litListStatus = computed(() => {
  if (isLitLoading.value) return 'loading'
  if (litLoadError.value) return 'error'
  if (litData.value.length === 0) return 'empty'
  if (filteredLitData.value.length === 0) return 'no-results'
  return ''
})
const litPagination = computed(() => paginateLiterature(
  filteredLitData.value,
  litCurrentPage.value,
  litPageSize,
))
const paginatedLitData = computed(() => litPagination.value.items)
const selectableCurrentPageLitIds = computed(() => paginatedLitData.value
  .filter((lit) => !isGraphSelectMode.value || hasGraphAttachment(lit))
  .map((lit) => lit.lit_id))
const allCurrentPageLitSelected = computed(() => areAllCurrentPageLiteratureSelected(
  selectedLitIds.value,
  selectableCurrentPageLitIds.value,
))
const litPageNumbers = computed(() => Array.from(
  { length: litPagination.value.totalPages },
  (_, index) => index + 1,
))

watch([litSearchFilter, litTypeFilter, litYearFilter], () => { litCurrentPage.value = 1 })
watch(() => litPagination.value.currentPage, (page) => {
  if (litCurrentPage.value !== page) litCurrentPage.value = page
})
watch(isGraphSelectMode, (enabled) => {
  clearLitSelection()
  if (!enabled) return
  currentMainTab.value = 'literature'
  loadLitData()
})

async function loadManageData() { await dataStore.loadAllData() }
async function loadLitData() {
  isLitLoading.value = true
  litLoadError.value = ''

  try {
    const rows = await getAllLiterature()
    if (!isComponentMounted.value) return
    litData.value = Array.isArray(rows) ? rows : []
    pruneGraphSelection()
  } catch (e) {
    if (!isComponentMounted.value) return
    console.error(e)
    litLoadError.value = '文献加载失败，请稍后重试'
  } finally {
    if (isComponentMounted.value) isLitLoading.value = false
  }
}
function setLitPage(page) { litCurrentPage.value = Math.min(litPagination.value.totalPages, Math.max(1, Number(page) || 1)) }
function openLitDetails(lit) { selectedLitDetails.value = lit }
function hasGraphAttachment(lit) { return Boolean(String(lit?.attachment || '').trim()) }
function toggleLitSelection(lit) {
  if (isGraphSelectMode.value && !hasGraphAttachment(lit)) return
  selectedLitIds.value = toggleLiteratureSelection(selectedLitIds.value, lit.lit_id)
}
function toggleCurrentPageLitSelection() { selectedLitIds.value = toggleCurrentPageLiteratureSelection(selectedLitIds.value, selectableCurrentPageLitIds.value) }
function clearLitSelection() { selectedLitIds.value = clearLiteratureSelection() }
function pruneGraphSelection() {
  if (!isGraphSelectMode.value) return
  const selectableIds = new Set(litData.value.filter(hasGraphAttachment).map((lit) => lit.lit_id))
  selectedLitIds.value = new Set([...selectedLitIds.value].filter((litId) => selectableIds.has(litId)))
}
function confirmGraphSelection() {
  const selected = selectedGraphDocuments.value
  if (selected.length === 0) {
    alert('请至少选择一篇已上传附件的文献')
    return
  }
  graphPreparationError.value = ''
  researchQuestionDialogOpen.value = true
}
async function startGraphBuild(submission) {
  if (isPreparingGraph.value) return
  const selected = [...selectedGraphDocuments.value]
  if (!selected.length) {
    researchQuestionDialogOpen.value = false
    graphPreparationError.value = '请至少选择一篇已上传附件的文献'
    return
  }

  researchQuestionDialogOpen.value = false
  isPreparingGraph.value = true
  graphPreparationError.value = ''

  try {
    const prepared = await prepareDocumentsForGraph(selected, {
      onProgress: ({ current, total }) => {
        graphPreparationStatus.value = `正在准备文献 ${current}/${total}...`
      },
    })
    graphPreparationStatus.value = '正在进入构图流程...'
    const intent = startResearchBuildFromLibrary(
      prepared.documents,
      prepared.documents.map((document) => document.id),
      submission,
    )
    if (!intent.canStart || intent.fileIds.length !== prepared.documents.length) {
      throw new Error(intent.error || '构图文献状态准备失败')
    }
    await router.push('/process/new')
  } catch (error) {
    graphPreparationStatus.value = ''
    graphPreparationError.value = error?.message || '构图文献准备失败，请重试'
  } finally {
    isPreparingGraph.value = false
  }
}
function cancelGraphSelection() {
  if (isPreparingGraph.value) return
  clearLitSelection()
  researchQuestionDialogOpen.value = false
  graphPreparationStatus.value = ''
  graphPreparationError.value = ''
  router.replace({ name: 'PlatformData' })
}

function switchMainTab(tab) { if (isGraphSelectMode.value && tab !== 'literature') return; currentMainTab.value = tab; if (tab === 'manage') loadManageData(); else if (tab === 'literature') loadLitData(); else if (tab === 'mongodb') checkMongoDBStatus() }
function switchManageTable(table) { addToNavigationHistory(); editingRowId.value = null; currentManageTable.value = table; loadManageData() }
function addToNavigationHistory() { navigationHistory.value.push({ table: currentManageTable.value, scrollY: window.scrollY }); if (navigationHistory.value.length > 10) navigationHistory.value.shift() }
function navigateBack() { const prev = navigationHistory.value.pop(); if (prev) { editingRowId.value = null; currentManageTable.value = prev.table; loadManageData() } }
function jumpToTab(type, targetId) { addToNavigationHistory(); currentManageTable.value = type; editingRowId.value = null; loadManageData(); setTimeout(() => { highlightRowId.value = targetId; setTimeout(() => { highlightRowId.value = null }, 2000) }, 300) }

async function checkMongoDBStatus() { isCheckingMongo.value = true; mongoStatusText.value = '正在检查连接...'; try { const r = await testMongoDB(); if (r && r.success) { mongoStatusText.value = 'MongoDB连接成功！'; mongoStatusOk.value = true } else { mongoStatusText.value = 'MongoDB未连接'; mongoStatusOk.value = false } } catch { mongoStatusText.value = '无法连接到服务器'; mongoStatusOk.value = false } finally { isCheckingMongo.value = false } }

function getRowId(row, table) { return row[ID_FIELD_MAP[table]] }
function handleDelete(row) { const id = getRowId(row, currentManageTable.value); if (!confirm('确定要删除这条记录吗？')) return; remove(currentManageTable.value, id).then(() => loadManageData()).catch(e => alert('删除失败：' + (e.message || '请重试'))) }
function startEdit(row) { editingRowId.value = getRowId(row, currentManageTable.value) }
function cancelEdit() { editingRowId.value = null }
async function saveEdit(payload) { const id = editingRowId.value; if (!id) return; if ((currentManageTable.value === 'mc' || currentManageTable.value === 'mr') && payload.component_list) { const validationError = validateComponentRows(currentManageTable.value, payload.component_list); if (validationError) { alert(validationError); return } } try { await update(currentManageTable.value, id, payload); editingRowId.value = null; await loadManageData() } catch (e) { alert('保存失败：' + (e.message || '请重试')) } }

function openAddModal() { switch (currentManageTable.value) { case 'mc': showAddMcModal.value = true; break; case 'mr': showAddMrModal.value = true; break; case 'mp': addMpProps.value = createEmptyPropertyDocument(); addMpValid.value = true; showAddMpModal.value = true; break; case 'tp': addTpMrId.value = ''; addTpResults.value = createEmptyPropertyDocument(); addTpValid.value = true; showAddTpModal.value = true; break; case 'fe': showAddFeModal.value = true; break; case 'ru': showAddRuModal.value = true; break } }

async function submitAddMc() { if (!addMcBatchNo.value) { alert('请输入批次号'); return } const validationError = validateComponentRows('mc', addMcComponents.value); if (validationError) { alert(validationError); return } try { await create('mc', { batch_no: addMcBatchNo.value, type: addMcType.value, component_list: addMcComponents.value.map(c => [c.name, c.id, '{}', Number(c.ratio)]) }); showAddMcModal.value = false; addMcBatchNo.value = ''; addMcComponents.value = [{ name: '新建原料', id: null, ratio: 100 }]; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddMr() { if (!addMrFormulaName.value) { alert('请输入配方名称'); return } const validationError = validateComponentRows('mr', addMrComponents.value); if (validationError) { alert(validationError); return } try { await create('mr', { formula_name: addMrFormulaName.value, formula_type: addMrFormulaType.value, batch_no: addMrBatchNo.value, component_list: addMrComponents.value.map(c => [c.name, c.id, '{}', Number(c.ratio)]), tp_ids: [] }); showAddMrModal.value = false; addMrFormulaName.value = ''; addMrBatchNo.value = ''; addMrComponents.value = [{ name: '新建成分', id: null, ratio: 100 }]; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddMp() { if (!addMpValid.value) { alert('请先修正物性测量中的格式或单位错误'); return } try { await create('mp', { fixed_properties: addMpProps.value, custom_properties: [] }); showAddMpModal.value = false; addMpProps.value = createEmptyPropertyDocument(); await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddTp() { if (!addTpMrId.value) { alert('请选择关联配方'); return } if (!addTpValid.value) { alert('请先修正测试物性中的格式或单位错误'); return } try { await create('tp', { mr_id: addTpMrId.value, test_params: {}, test_results: addTpResults.value }); showAddTpModal.value = false; addTpMrId.value = ''; addTpResults.value = createEmptyPropertyDocument(); await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddFe() { if (!addFeConditionName.value) { alert('请输入工况名称'); return } let params = {}; try { params = addFeConditionParams.value ? JSON.parse(addFeConditionParams.value) : {} } catch { alert('工况参数格式错误'); return } try { await create('fe', { condition_name: addFeConditionName.value, condition_type: '', condition_params: params, mr_ids: addFeMrIds.value ? addFeMrIds.value.split(',').map(s => s.trim()) : [] }); showAddFeModal.value = false; addFeConditionName.value = ''; addFeConditionParams.value = ''; addFeMrIds.value = ''; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddRu() { if (!addRuServiceName.value) { alert('请输入服役名称'); return } let params = {}; try { params = addRuServiceParams.value ? JSON.parse(addRuServiceParams.value) : {} } catch { alert('服役参数格式错误'); return } try { await create('ru', { service_name: addRuServiceName.value, service_type: '', service_params: params, fe_ids: addRuFeIds.value ? addRuFeIds.value.split(',').map(s => s.trim()) : [], mr_ids: addRuMrIds.value ? addRuMrIds.value.split(',').map(s => s.trim()) : [] }); showAddRuModal.value = false; addRuServiceName.value = ''; addRuServiceParams.value = ''; addRuFeIds.value = ''; addRuMrIds.value = ''; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }

function resetLitForm() { addLitForm.value = { title: '', authors: '', journal: '', year: '', volume: '', number: '', pages: '', entry_type: 'journal', abstract: '', doi: '', note: '' }; isEditingLit.value = false; editingLitId.value = '' }
function openAddLitModal() { resetLitForm(); showAddLitModal.value = true }
function openEditLitModal(lit) { isEditingLit.value = true; editingLitId.value = lit.lit_id; addLitForm.value = { title: lit.title || '', authors: lit.authors || '', journal: lit.journal || '', year: String(lit.year || ''), volume: lit.volume || '', number: lit.number || '', pages: lit.pages || '', entry_type: lit.entry_type || 'journal', abstract: lit.abstract || '', doi: lit.doi || '', note: lit.note || '' }; showAddLitModal.value = true }
async function submitAddLit() { const f = addLitForm.value; if (!f.title || !f.authors) { alert('请填写标题和作者'); return } try { const payload = toLiteraturePayload(f); if (isEditingLit.value) { await update('lit', editingLitId.value, payload) } else { await create('lit', payload) }; showAddLitModal.value = false; resetLitForm(); await loadLitData() } catch (e) { alert((isEditingLit.value ? '更新' : '添加') + '失败：' + (e.response?.data?.error || e.message || '请重试')) } }
async function handleDeleteLit(lit) {
  try {
    const deleted = await deleteLiteratureWithAttachments(lit, {
      deleteAttachment: removeAttachment,
      deleteLiterature: litId => remove('lit', litId),
    })
    if (!deleted) return
    selectedLitIds.value = removeLiteratureSelection(selectedLitIds.value, lit.lit_id)
    await loadLitData()
  } catch (e) {
    alert('删除失败：' + (e.response?.data?.error || e.message || '请重试'))
  }
}
async function handleConfirmLitType(lit, entryType) { if (!lit?.lit_id || !entryType || confirmingLitTypeId.value) return; confirmingLitTypeId.value = lit.lit_id; try { await update('lit', lit.lit_id, { entry_type: entryType }); await loadLitData() } catch (e) { alert('类型保存失败：' + (e.response?.data?.error || e.message || '请重试')) } finally { confirmingLitTypeId.value = '' } }
async function handleUploadAttachment(litId) { const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,application/pdf'; input.onchange = async () => { const file = input.files?.[0]; if (file) { try { await uploadAttachment(file, litId); await loadLitData(); alert('PDF 上传成功') } catch (e) { alert('上传失败：' + (e.response?.data?.error || e.message || '请重试')) } }; input.remove() }; input.click() }
async function handleDirectPdfImport(file) { if (isImportingPdf.value) return; const progressText = { validating: '正在检查 PDF…', uploading: '正在上传 PDF…', parsing: '正在解析文献信息…', complete: '导入完成' }; isImportingPdf.value = true; pdfImportStatus.value = ''; try { const result = await importLiteraturePdf(file, { onProgress: stage => { pdfImportStatus.value = progressText[stage] || '' } }); await loadLitData(); pdfImportStatus.value = result.degraded ? 'PDF 已导入，可稍后补充文献信息' : '导入完成' } catch (e) { pdfImportStatus.value = '导入失败：' + (e.response?.data?.error || e.response?.data?.message || e.message || '请重试') } finally { isImportingPdf.value = false } }

function openCreateMc() { showCreateMcModal.value = true }
async function submitCreateMc() { if (!createMcBatchNo.value) { alert('请输入批次号'); return } const validationError = validateComponentRows('mc', createMcComponents.value); if (validationError) { alert(validationError); return } try { await create('mc', { batch_no: createMcBatchNo.value, type: createMcType.value, component_list: createMcComponents.value.map(c => [c.name, c.id, '{}', Number(c.ratio)]) }); showCreateMcModal.value = false; createMcBatchNo.value = ''; createMcComponents.value = [{ name: '新建原料', id: null, ratio: 100 }]; await loadManageData() } catch (e) { alert('创建失败：' + (e.message || '请重试')) } }

function openCreateMp(itemIndex) { let target = 'row'; if (showAddMcModal.value) target = 'addMc'; createMpTarget.value = { target, itemIndex }; const existingId = target === 'addMc' ? (addMcComponents.value[itemIndex]?.id || '') : ''; createMpExistingId.value = existingId; const mp = existingId ? dataStore.allMpData.find(item => item.mp_id === existingId) : null; createMpProps.value = normalizePropertyDocument(mp?.fixed_properties || createEmptyPropertyDocument(), propertiesStore.pureMaterialProperties); createMpValid.value = true; showCreateMpModal.value = true }

async function submitCreateMp() { if (!createMpValid.value) { alert('请先修正物性测量中的格式或单位错误'); return } try { const target = createMpTarget.value; const existingId = createMpExistingId.value; const data = { fixed_properties: createMpProps.value, custom_properties: [] }; const res = existingId ? await update('mp', existingId, data) : await create('mp', data); const mpId = existingId || res?.mp_id; if (mpId && target?.target === 'addMc') { addMcComponents.value = assignComponentId(addMcComponents.value, target.itemIndex, mpId) } else if (mpId && target?.target === 'row') { tableRef.value?.setEditingComponent(target.itemIndex, { id: mpId }) } showCreateMpModal.value = false; createMpProps.value = createEmptyPropertyDocument(); createMpExistingId.value = ''; createMpTarget.value = null; await loadManageData() } catch (e) { console.error(e); alert('处理物性数据失败：' + (e.message || '请重试')) } }

onMounted(() => {
  propertiesStore.loadConfig()
  if (isGraphSelectMode.value) {
    currentMainTab.value = 'literature'
    loadLitData()
  }
})
onUnmounted(() => { isComponentMounted.value = false; if (manageDebounceTimer) clearTimeout(manageDebounceTimer) })
</script>

<style scoped>
.graph-select-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin: 16px 0 24px;
  padding: 20px 22px;
  border: 1px solid color-mix(in srgb, var(--asc-primary) 32%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--asc-primary) 8%, white);
}

.graph-select-panel__eyebrow {
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .06em;
}

.graph-select-panel h3 {
  margin: 6px 0;
  color: var(--text-primary);
}

.graph-select-panel p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.graph-select-panel__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  flex-shrink: 0;
}

.graph-select-panel__status,
.graph-select-panel__error {
  flex-basis: 100%;
  margin: 0;
  font-size: 13px;
  text-align: right;
}

.graph-select-panel__status {
  color: var(--asc-primary);
}

.graph-select-panel__error {
  color: #b42318;
}

@media (max-width: 900px) {
  .graph-select-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .graph-select-panel__actions {
    justify-content: flex-start;
  }

  .graph-select-panel__status,
  .graph-select-panel__error {
    text-align: left;
  }
}
</style>
