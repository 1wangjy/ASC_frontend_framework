<template>
  <div class="platform-page pl-tabfill">
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

    <!-- ML Dataset Section -->
    <div v-show="currentMainTab === 'ml'" class="tab-content" :class="{ active: currentMainTab === 'ml' }">
      <div class="section"><MlDatasetView class="pl-eqfill pl-scroll" /></div>
    </div>

    <!-- Parse Section -->
    <div v-show="currentMainTab === 'parse'" class="tab-content" :class="{ active: currentMainTab === 'parse' }">
      <div class="section">
        <div class="tab-container">
          <button v-for="pt in PARSE_TABS" :key="pt.key" :class="['tab-btn', { active: currentParseTab === pt.key }]" @click="currentParseTab = pt.key">{{ pt.label }}</button>
        </div>
        <div v-show="currentParseTab === 'recipe'" class="tab-content pl-scroll" :class="{ active: currentParseTab === 'recipe' }">
          <RecipeParserPanel :show-submit="true" :show-embedding="false" @submit="loadManageData" />
        </div>
        <div v-show="currentParseTab === 'working'" class="tab-content pl-scroll" :class="{ active: currentParseTab === 'working' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">⚙️</div><p style="font-size:18px;font-weight:500">工况解析功能开发中...</p></div>
        </div>
        <div v-show="currentParseTab === 'service'" class="tab-content pl-scroll" :class="{ active: currentParseTab === 'service' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">🔧</div><p style="font-size:18px;font-weight:500">服役解析功能开发中...</p></div>
        </div>
        <div v-show="currentParseTab === 'reconstruct'" class="tab-content pl-scroll" :class="{ active: currentParseTab === 'reconstruct' }">
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
        <div class="manage-toolbar">
          <input v-model="manageSearchFilter" type="text" placeholder="输入关键词搜索当前表记录..." class="filter-input" aria-label="搜索当前数据表记录" />
          <div class="manage-summary" aria-label="当前数据概览">
            <span class="manage-chip manage-chip--label">{{ currentManageTableLabel }}</span>
            <span class="manage-chip manage-chip--accent" title="当前数据表内记录总数">共 {{ manageTotalCount }} 条</span>
            <span v-if="manageIsFiltered" class="manage-chip" title="当前关键词筛选匹配的记录数">匹配 {{ manageData.length }} 条</span>
          </div>
          <div class="manage-actions">
            <button class="btn" @click="openAddModal()">{{ addRecordLabel }}</button>
            <button class="btn btn-ghost btn-small" title="重新从服务端加载当前表数据" @click="loadManageData()">刷新数据</button>
            <button class="btn btn-ghost btn-small" title="把 ./private/*.npy 载入当前 sqlite（幂等）"
              :disabled="mlLoading" @click="callMlLoad">
              <span v-if="mlLoading" class="loading" />{{ mlLoading ? '载入中…' : '载入 ML 数据集' }}</button>
          </div>
        </div>
        <div v-if="mlLoadMsg" :style="{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', fontSize: '12.5px', whiteSpace: 'pre-wrap', background: mlLoadErr ? '#fee2e2' : '#dcfce7', color: mlLoadErr ? '#991b1b' : '#166534' }">{{ mlLoadMsg }}</div>
        <DataTable ref="tableRef" class="pl-eqfill pl-scroll" :data="manageData" :table="currentManageTable" :editing-row-id="editingRowId"
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
        <div class="toolbar lit-top-toolbar">
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
          v-if="litListStatus === 'loading' || litListStatus === 'error'"
          :status="litListStatus"
          @retry="loadLitData"
        />
        <div v-else class="lit-workspace pl-eqfill">
          <!-- 左栏：文库 / 分类 -->
          <aside class="lit-pane lit-rail" aria-label="文献分类">
            <div class="lit-pane-head">
              <span>我的文库</span>
            </div>
            <div class="lit-rail__body pl-eqfill pl-scroll">
              <div class="lit-rail__group">
                <button
                  v-for="item in litLibraryCollections"
                  :key="item.key"
                  type="button"
                  class="lit-rail__item"
                  :class="{ active: litActiveCollectionKey === item.key }"
                  @click="selectLitCollection(item.key)"
                >
                  <span class="lit-rail__glyph" aria-hidden="true"></span>
                  <span class="lit-rail__label">{{ item.label }}</span>
                  <span class="lit-rail__count">{{ item.count }}</span>
                </button>
              </div>
              <div v-if="litTypeCollections.length" class="lit-rail__divider">按类型</div>
              <div class="lit-rail__group">
                <button
                  v-for="item in litTypeCollections"
                  :key="item.key"
                  type="button"
                  class="lit-rail__item lit-rail__item--type"
                  :class="{ active: litActiveCollectionKey === item.key }"
                  @click="selectLitCollection(item.key)"
                >
                  <span class="lit-rail__glyph" aria-hidden="true"></span>
                  <span class="lit-rail__label">{{ item.label }}</span>
                  <span class="lit-rail__count">{{ item.count }}</span>
                </button>
              </div>
            </div>
          </aside>

          <!-- 中栏：文献列表 -->
          <section class="lit-pane lit-list-pane" aria-label="文献列表">
            <div class="lit-list-toolbar">
              <label class="lit-select-all">
                <input
                  type="checkbox"
                  :checked="allCurrentPageLitSelected"
                  :disabled="selectableCurrentPageLitIds.length === 0"
                  aria-label="全选当前页文献"
                  @change="toggleCurrentPageLitSelection"
                />
                <span>{{ isGraphSelectMode ? '全选当前页可构图文献' : '全选当前页' }}</span>
              </label>
              <span class="lit-selected-count">已选择 {{ selectedLitIds.size }} 篇文献</span>
              <button
                v-if="selectedLitIds.size > 0"
                type="button"
                class="btn btn-secondary btn-small lit-clear-selection"
                @click="clearLitSelection"
              >
                清空选择
              </button>
            </div>
            <p v-if="litListStatus === 'empty'" class="lit-no-results" role="status">
              暂无文献，可通过「导入 PDF」或「手动新增」添加第一篇文献
            </p>
            <p v-else-if="litListStatus === 'no-results'" class="lit-no-results" role="status">
              未找到符合当前条件的文献，请调整搜索关键词或筛选条件
            </p>
            <ul v-else class="lit-row-list pl-eqfill pl-scroll">
              <li
                v-for="lit in paginatedLitData"
                :key="lit.lit_id"
                class="lit-row"
                :class="{ 'is-detail': litDetail?.lit_id === lit.lit_id }"
                @click="openLitDetail(lit)"
              >
                <label
                  class="lit-row__check"
                  :style="{ cursor: isGraphSelectMode && !hasGraphAttachment(lit) ? 'not-allowed' : 'pointer' }"
                  :title="isGraphSelectMode && !hasGraphAttachment(lit) ? '请先上传附件后再选择' : ''"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    :checked="selectedLitIds.has(lit.lit_id)"
                    :disabled="isGraphSelectMode && !hasGraphAttachment(lit)"
                    :aria-label="selectedLitIds.has(lit.lit_id) ? `取消选择 ${lit.title}` : `选择 ${lit.title}`"
                    @change="toggleLitSelection(lit)"
                  />
                </label>
                <div class="lit-row__main">
                  <div class="lit-row__line">
                    <span v-if="lit.entry_type" class="lit-type-chip">{{ litTypeLabel(lit.entry_type) }}</span>
                    <span v-else class="lit-type-chip lit-type-chip--pending">待分类</span>
                    <span class="lit-row__title">{{ lit.title }}</span>
                  </div>
                  <div class="lit-row__meta">
                    <span class="lit-row__meta-el">{{ lit.authors || '未知作者' }}</span>
                    <span v-if="lit.journal" class="lit-row__sep" aria-hidden="true">·</span>
                    <span v-if="lit.journal" class="lit-row__meta-el">{{ lit.journal }}</span>
                    <span v-if="lit.year" class="lit-row__sep" aria-hidden="true">·</span>
                    <span v-if="lit.year" class="lit-row__meta-el">{{ lit.year }}</span>
                  </div>
                </div>
                <span
                  v-if="hasGraphAttachment(lit)"
                  class="lit-pdf-pill"
                  title="已上传 PDF 附件"
                >PDF</span>
              </li>
            </ul>
            <nav
              v-if="litPagination.totalPages > 1"
              aria-label="文献列表分页"
              class="lit-pagination"
            >
              <button
                type="button"
                class="btn btn-secondary btn-small"
                :disabled="litPagination.currentPage === 1"
                @click="setLitPage(litPagination.currentPage - 1)"
              >
                上一页
              </button>
              <template v-for="(page, i) in litPageNumbers" :key="page">
                <span v-if="typeof page !== 'number'" class="lit-pagination__gap" aria-hidden="true">…</span>
                <button
                  v-else
                  type="button"
                  class="btn btn-secondary btn-small"
                  :aria-current="page === litPagination.currentPage ? 'page' : undefined"
                  :style="page === litPagination.currentPage ? { background: 'var(--asc-primary)', color: '#fff' } : undefined"
                  @click="setLitPage(page)"
                >
                  {{ page }}
                </button>
              </template>
              <button
                type="button"
                class="btn btn-secondary btn-small"
                :disabled="litPagination.currentPage === litPagination.totalPages"
                @click="setLitPage(litPagination.currentPage + 1)"
              >
                下一页
              </button>
              <span class="lit-pagination__total">共 {{ litPagination.totalItems }} 条</span>
            </nav>
          </section>

          <!-- 右栏：详情 -->
          <aside v-if="litDetail" class="lit-pane lit-detail" aria-label="文献详情">
            <header class="lit-detail__head">
              <div class="lit-detail__type">
                <LiteratureTypeControl
                  :entry-type="litDetail.entry_type || ''"
                  :options="litTypeOptions"
                  :busy="confirmingLitTypeId === litDetail.lit_id"
                  @confirm="entryType => handleConfirmLitType(litDetail, entryType)"
                />
              </div>
              <button
                type="button"
                class="lit-detail__close"
                aria-label="关闭详情"
                title="关闭详情"
                @click="litDetail = null"
              >×</button>
            </header>

            <h3 class="lit-detail__title">{{ litDetail.title }}</h3>

            <dl class="lit-detail__meta">
              <div class="lit-detail__meta-row">
                <dt>作者</dt>
                <dd>{{ litDetail.authors || '—' }}</dd>
              </div>
              <div v-if="litDetail.journal" class="lit-detail__meta-row">
                <dt>期刊 / 会议</dt>
                <dd>{{ litDetail.journal }}</dd>
              </div>
              <div v-if="litDetail.year" class="lit-detail__meta-row">
                <dt>年份</dt>
                <dd>{{ litDetail.year }}</dd>
              </div>
              <div class="lit-detail__meta-row">
                <dt>ID</dt>
                <dd><span class="id-badge">{{ litDetail.lit_id }}</span></dd>
              </div>
              <div
                v-if="litDetail.volume || litDetail.number || litDetail.pages"
                class="lit-detail__meta-row"
              >
                <dt>卷 / 期 / 页</dt>
                <dd>{{ [litDetail.volume, litDetail.number, litDetail.pages].filter(Boolean).join(', ') }}</dd>
              </div>
              <div v-if="litDetail.doi" class="lit-detail__meta-row">
                <dt>DOI</dt>
                <dd>{{ litDetail.doi }}</dd>
              </div>
              <div v-if="litDetail.abstract" class="lit-detail__meta-row lit-detail__meta-row--block">
                <dt>摘要</dt>
                <dd>{{ litDetail.abstract }}</dd>
              </div>
              <div v-if="litDetail.note" class="lit-detail__meta-row lit-detail__meta-row--block">
                <dt>备注</dt>
                <dd>{{ litDetail.note }}</dd>
              </div>
            </dl>

            <div class="lit-detail__section">
              <h4>附件</h4>
              <LiteratureAttachmentActions :literature="litDetail" @upload="handleUploadAttachment" />
            </div>

            <footer class="lit-detail__actions">
              <button type="button" class="btn btn-secondary btn-small" @click="openLitDetails(litDetail)">查看</button>
              <button type="button" class="btn btn-secondary btn-small" @click="openEditLitModal(litDetail)">编辑</button>
              <button type="button" class="btn btn-danger btn-small" @click="handleDeleteLit(litDetail)">删除</button>
            </footer>
          </aside>

          <aside v-else class="lit-pane lit-detail lit-detail--empty" aria-label="文献详情">
            <span class="lit-detail__empty-glyph" aria-hidden="true">📄</span>
            <p>从列表选择一篇文献<br />在此查看完整详情</p>
          </aside>
        </div>
      </div>
    </div>

    <!-- MongoDB Section -->
    <div v-show="currentMainTab === 'mongodb'" class="tab-content" :class="{ active: currentMainTab === 'mongodb' }">
      <div class="section">
        <h2>MongoDB管理</h2>
        <p style="margin-bottom:24px;color:var(--text-secondary)">使用Mongo Express进行MongoDB数据库管理</p>
        <div class="pl-eqfill" style="width:100%;height:600px;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border-color)">
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
import { loadMlDataset } from '../api/models'
import MlDatasetView from '../components/MlDatasetView.vue'
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

const MAIN_TABS = [{ key: 'parse', label: '数据解析' }, { key: 'manage', label: '数据管理' }, { key: 'ml', label: 'ML 数据集' }, { key: 'literature', label: '文献库管理' }, { key: 'mongodb', label: 'MongoDB测试' }]
const PARSE_TABS = [{ key: 'recipe', label: '配方/测试解析' }, { key: 'working', label: '工况解析' }, { key: 'service', label: '服役解析' }, { key: 'reconstruct', label: '重建解析' }]
const MANAGE_TABS = [{ key: 'mc', label: '原料表' }, { key: 'mr', label: '配方表' }, { key: 'mp', label: '物性表' }, { key: 'tp', label: '测试表' }, { key: 'fe', label: '工况记录' }, { key: 'ru', label: '服役记录' }]
const ADD_RECORD_LABELS = { mp: '新建物性记录', tp: '新建测试记录' }
const LIT_TYPE_LABELS = { journal: '期刊论文', conference: '会议论文', patent: '专利', book: '书籍' }

const dataStore = usePlatformDataStore()
const mlLoading = ref(false)
const mlLoadMsg = ref('')
const mlLoadErr = ref(false)
async function callMlLoad() {
  mlLoading.value = true; mlLoadErr.value = false; mlLoadMsg.value = ''
  try {
    const r = await loadMlDataset()
    const msg = (r && (r.message || (r.data && r.data.message))) || ''
    mlLoadMsg.value = 'ML 数据集载入完成：' + String(msg || '').trim()
  } catch (e) {
    mlLoadErr.value = true
    mlLoadMsg.value = '载入失败：' + (e?.message || e || '未知错误')
  } finally { mlLoading.value = false }
}
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
const litDetail = ref(null)
const litActiveCollection = ref('all')
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
const currentManageTableLabel = computed(() => MANAGE_TABS.find(t => t.key === currentManageTable.value)?.label || '数据管理')
const manageTotalCount = computed(() => dataStore.getDataByTable(currentManageTable.value)?.length || 0)
const manageIsFiltered = computed(() => !!debouncedManageFilter.value)
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
const litCollectionData = computed(() => {
  const rows = litData.value
  if (litTypeFilter.value) return rows
  const view = litActiveCollection.value
  if (view === 'recent') {
    return [...rows].sort((left, right) => {
      const leftTime = String(left?.create_time || '').trim()
      const rightTime = String(right?.create_time || '').trim()
      if (!leftTime && !rightTime) return 0
      if (!leftTime) return 1
      if (!rightTime) return -1
      return leftTime < rightTime ? 1 : leftTime > rightTime ? -1 : 0
    })
  }
  if (view === 'unclassified') {
    return rows.filter((lit) => !String(lit?.entry_type || '').trim())
  }
  return rows
})
const litActiveCollectionKey = computed(() => (
  litTypeFilter.value ? `type:${litTypeFilter.value}` : litActiveCollection.value
))
const litLibraryCollections = computed(() => {
  const total = litData.value.length
  const unclassified = litData.value.reduce(
    (sum, lit) => sum + (String(lit?.entry_type || '').trim() ? 0 : 1),
    0,
  )
  return [
    { key: 'all', label: '全部文献', count: total },
    { key: 'recent', label: '最近添加', count: total },
    { key: 'unclassified', label: '未分类', count: unclassified },
  ]
})
const litTypeCollections = computed(() => {
  const counts = new Map()
  for (const lit of litData.value) {
    const type = String(lit?.entry_type || '').trim()
    if (type) counts.set(type, (counts.get(type) || 0) + 1)
  }
  return litTypeOptions.value.map((option) => ({
    key: `type:${option.value}`,
    label: option.label,
    count: counts.get(option.value) || 0,
  }))
})
const filteredLitData = computed(() => filterLiteratureByQuery(
  litCollectionData.value,
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
// 窗口化分页：首/末 + 当前±1，其余以省略号折叠（避免上百页堆叠）。
const litPageNumbers = computed(() => {
  const total = litPagination.value.totalPages
  const cur = litPagination.value.currentPage
  const out = []
  if (total <= 7) {
    for (let i = 1; i <= total; i += 1) out.push(i)
    return out
  }
  const left = Math.max(2, cur - 1)
  const right = Math.min(total - 1, cur + 1)
  out.push(1)
  if (left > 2) out.push('gap-l')
  for (let i = left; i <= right; i += 1) out.push(i)
  if (right < total - 1) out.push('gap-r')
  out.push(total)
  return out
})

watch([litSearchFilter, litTypeFilter, litYearFilter], () => { litCurrentPage.value = 1 })
watch(litData, (rows) => {
  if (!litDetail.value) return
  litDetail.value = rows.find((lit) => lit.lit_id === litDetail.value.lit_id) || null
})
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
function openLitDetail(lit) { litDetail.value = lit }
function selectLitCollection(key) {
  if (key.startsWith('type:')) {
    litActiveCollection.value = 'all'
    litTypeFilter.value = key.slice('type:'.length)
  } else {
    litTypeFilter.value = ''
    litActiveCollection.value = key
  }
  litCurrentPage.value = 1
}
function litTypeLabel(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return litTypeOptions.value.find((option) => option.value === raw)?.label || raw
}
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
  const tabParam = route.query.tab
  if (tabParam && ['parse', 'manage', 'literature', 'mongodb'].includes(String(tabParam))) {
    switchMainTab(String(tabParam))
  } else if (isGraphSelectMode.value) {
    currentMainTab.value = 'literature'
    loadLitData()
  }
})
onUnmounted(() => { isComponentMounted.value = false; if (manageDebounceTimer) clearTimeout(manageDebounceTimer) })
</script>

<style scoped>
/* ============ 数据管理（manage MAIN_TAB）工具条 ============ */
.manage-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 12px 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--asc-primary) 5%, #ffffff), #ffffff 70%);
  border: 1px solid color-mix(in srgb, var(--asc-border) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(16, 42, 67, 0.05);
}

.manage-toolbar .filter-input {
  flex: 1 1 260px;
  min-width: 220px;
  margin: 0;
  border-radius: 8px;
}

.manage-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.manage-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--asc-surface-soft, #f7fafd);
  border: 1px solid var(--asc-border);
  color: var(--asc-muted, #6b7f93);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.manage-chip--label {
  background: linear-gradient(135deg, #0a75bd, #0869ad 55%, #05588f);
  border-color: var(--asc-primary, #0869ad);
  color: #ffffff;
}

.manage-chip--accent {
  background: var(--asc-primary-soft, #eaf5fc);
  border-color: color-mix(in srgb, var(--asc-primary) 26%, #ffffff);
  color: var(--asc-primary, #0869ad);
}

.manage-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 760px) {
  .manage-actions { margin-left: 0; width: 100%; }
  .manage-actions .btn { flex: 1; }
}

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

/* ============ 文献管理：Zotero 式三栏工作区 ============ */
.platform-page .lit-top-toolbar { margin-bottom: 14px; }

.lit-workspace {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr) 336px;
  grid-template-areas: "rail list detail";
  gap: 14px;
  align-items: stretch;
}

.lit-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--asc-surface, #ffffff);
  border: 1px solid var(--asc-border);
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(16, 42, 67, 0.05);
  overflow: hidden;
}

.lit-pane-head {
  position: relative;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--asc-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--asc-primary) 6%, #ffffff), #ffffff);
  color: var(--asc-heading);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.lit-pane-head::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--asc-primary), color-mix(in srgb, var(--asc-primary) 12%, transparent) 60%, transparent);
}

.lit-rail { grid-area: rail; min-height: 340px; }
.lit-list-pane { grid-area: list; min-height: 340px; }
.lit-detail { grid-area: detail; min-height: 340px; }

.lit-rail__body { padding: 8px; }

.lit-rail__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lit-rail__divider {
  margin: 10px 10px 4px;
  color: var(--asc-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.lit-rail__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--asc-text);
  font-size: 13.5px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--asc-transition, 180ms ease), color var(--asc-transition, 180ms ease);
}

.lit-rail__item:hover { background: var(--asc-primary-soft); color: var(--asc-heading); }

.lit-rail__item.active {
  background: color-mix(in srgb, var(--asc-primary) 11%, #ffffff);
  color: var(--asc-primary);
  font-weight: 600;
}

.lit-rail__glyph {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--asc-border-strong);
  transition: background-color var(--asc-transition, 180ms ease);
}

.lit-rail__item--type .lit-rail__glyph {
  border-radius: 2px;
  background: color-mix(in srgb, var(--asc-primary) 38%, transparent);
}

.lit-rail__item.active .lit-rail__glyph { background: var(--asc-primary); }

.lit-rail__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lit-rail__count {
  margin-left: auto;
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 20px;
  background: var(--asc-canvas, #eef3f8);
  color: var(--asc-muted);
  font-size: 11.5px;
  line-height: 16px;
  text-align: center;
  flex-shrink: 0;
}

.lit-rail__item.active .lit-rail__count {
  background: color-mix(in srgb, var(--asc-primary) 12%, #ffffff);
  color: var(--asc-primary);
}

/* 中栏列表 */
.lit-list-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--asc-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--asc-primary) 5%, #ffffff), #ffffff);
}

.lit-select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--asc-text);
  font-size: 13px;
  cursor: pointer;
}

.lit-selected-count { color: var(--asc-muted); font-size: 12.5px; }

.lit-list-toolbar .lit-clear-selection { margin-left: auto; }

.lit-row-list { margin: 0; padding: 0; list-style: none; }

.lit-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px 9px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--asc-border) 55%, transparent);
  cursor: pointer;
  transition: background-color 120ms ease;
}

.lit-row:last-child { border-bottom: none; }
.lit-row:hover { background: var(--asc-surface-soft, #f7fafd); }

.lit-row.is-detail { background: color-mix(in srgb, var(--asc-primary) 7%, #ffffff); }

.lit-row.is-detail::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--asc-primary);
}

.lit-row__check {
  display: flex;
  align-items: flex-start;
  flex-shrink: 0;
  padding-top: 2px;
}

.lit-row__check input { margin: 0; }

.lit-row__main { flex: 1; min-width: 0; }

.lit-row__line { display: flex; align-items: center; gap: 8px; min-width: 0; }

.lit-row__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--asc-heading);
  font-size: 14px;
  font-weight: 600;
}

.lit-type-chip {
  flex-shrink: 0;
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--asc-primary) 16%, transparent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--asc-primary) 9%, #ffffff);
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.lit-type-chip--pending {
  border-color: #fde68a;
  background: #fef3c7;
  color: #92400e;
}

.lit-row__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 3px;
  color: var(--asc-muted);
  font-size: 12px;
}

.lit-row__meta-el {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lit-row__sep { flex-shrink: 0; opacity: 0.5; }

.lit-pdf-pill {
  align-self: center;
  flex-shrink: 0;
  margin-left: 2px;
  padding: 1px 6px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.lit-no-results {
  margin: 0;
  padding: 48px 20px;
  color: var(--asc-muted);
  font-size: 14px;
  text-align: center;
}

.lit-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--asc-border);
  background: var(--asc-surface-soft, #f7fafd);
}

.lit-pagination__gap { padding: 0 6px; color: var(--asc-muted); user-select: none; }
.lit-pagination__total { margin-left: 4px; color: var(--asc-muted); font-size: 12.5px; }

/* 右栏详情 */
.lit-detail { gap: 12px; padding: 14px 16px 16px; }

.lit-detail--empty {
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 24px 20px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--asc-primary) 4%, #ffffff), #ffffff);
  color: var(--asc-muted);
  font-size: 13.5px;
  line-height: 1.8;
  text-align: center;
}

.lit-detail--empty p { margin: 4px 0 0; }

.lit-detail__empty-glyph { font-size: 34px; line-height: 1; opacity: 0.55; }

.lit-detail__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }

.lit-detail__type { min-width: 0; }

.lit-detail__close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--asc-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.lit-detail__close:hover { background: var(--asc-primary-soft); color: var(--asc-heading); }

.lit-detail__title {
  margin: 0;
  color: var(--asc-heading);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.lit-detail__meta { margin: 0; display: flex; flex-direction: column; gap: 6px; }

.lit-detail__meta-row {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 8px;
  font-size: 13px;
}

.lit-detail__meta-row dt { color: var(--asc-muted); }

.lit-detail__meta-row dd {
  margin: 0;
  min-width: 0;
  color: var(--asc-text);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.lit-detail__meta-row--block {
  display: block;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--asc-border);
}

.lit-detail__meta-row--block dt { margin-bottom: 2px; font-size: 12px; }

.lit-detail__section {
  padding-top: 10px;
  border-top: 1px solid var(--asc-border);
}

.lit-detail__section h4 {
  margin: 0 0 2px;
  color: var(--asc-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.lit-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--asc-border);
}

@media (max-width: 1100px) {
  .lit-workspace {
    grid-template-columns: 200px minmax(0, 1fr);
    grid-template-areas:
      "rail list"
      "detail detail";
  }
}

@media (max-width: 760px) {
  .lit-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "rail"
      "list"
      "detail";
  }
}

/* ══ Literature part alignment unification ══ */
/* Pane headers: one consistent height + baseline across rail/list/detail */
.lit-pane-head {
  min-height: 46px;
  padding: 0 16px;
}
.lit-pane-head .lit-pane-head__icon,
.lit-pane-head > * { line-height: 1; }

/* Left rail: items baseline-align icon + label, consistent row height */
.lit-rail__item {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  gap: 9px;
  border-radius: 7px;
}
.lit-rail__glyph { display: inline-flex; align-items: center; justify-content: center; width: 16px; flex: 0 0 16px; }
.lit-rail__label { line-height: 1.2; }
.lit-rail__count { margin-left: auto; }

/* Middle toolbar: compact + aligned with pane padding */
.lit-list-toolbar {
  min-height: 46px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--asc-border);
}
.lit-select-all { display: inline-flex; align-items: center; gap: 7px; min-height: 30px; }
.lit-selected-count { font-size: 13px; }
.lit-row { min-height: 56px; }

/* Right detail empty-state fills the pane with a centered hint */
.lit-detail--empty {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.lit-detail__empty-glyph { margin: 0 auto 10px; }

/* Detail metadata dl rows: baseline spacing consistent with rest */
.lit-detail { padding: 16px; }
.lit-detail__meta { margin: 0; }

/* ══ Viewport fill (>=961px): marked regions claim the panel height ══
   The shared `.pl-tabfill` contract (platform.css) makes the active main
   panel fill the viewport; these rules let the literature workspace be that
   fill and hand each pane its own scroll port, so the page never scrolls for
   the tabs. <961px the release mirrors the model pages: panes hug content. */
@media (min-width: 961px) {
  .lit-workspace.pl-eqfill { min-height: 0; }
  .lit-workspace.pl-eqfill .lit-pane { min-height: 0; }
  /* detail pane scrolls on its own, header stays pinned to the top edge */
  .lit-detail:not(.lit-detail--empty) { overflow-y: auto; }
  .lit-detail:not(.lit-detail--empty) .lit-detail__head {
    position: sticky; top: 0; z-index: 1;
    background: var(--asc-surface, #ffffff);
  }
}

</style>
