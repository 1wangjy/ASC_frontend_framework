# 远端同步与 Agent 复验（2026-10-19）

以 Gitee `a0486fb` 为基础，在 `agent/multiturn-sync-20261019` 分支迁移历史匹配、上下文条目继承、JSON格式修复、18组测试集及三工具补测脚本。保留新版会话用户隔离、mode/workspace字段及界面目录管理。

## 结果

- 选定后端回归142项通过。
- 前端Agent相关回归94项通过，2项真实调用测试跳过；生产构建通过。适配新版布局、共享介绍组件及空会话提示的测试断言，没有覆盖远端UI实现。
- 18组96轮完整复测：95轮真实模型最终回答，1轮预设503处理通过，无意外基础设施错误。人工核心场景复核17组符合、1组部分符合。
- 74个评测轮调用规则74/74；必须工具名称/顺序28/28；固定服务原答案与引用透传22/22；片段读取6/6且同轮登记有效。

MT18历史找回LONG-X73、13 wt%、2小时，最终JSON五项正确；第23轮检索query遗漏2小时并擅自补入ASC体系，所以本组部分符合。工具名称通过不等于参数语义完整。

以上使用真实配置模型、固定知识工具返回，每组1次；不代表真实知识API验收、科学正确率、浏览器端验收或模型最大上下文压测。

## 修改与范围

已迁移历史检索归一化/字段别名、条目焦点、明确外部引用条件隔离、JSON与短名称/残句处理。新增历史读取回顾检查：仅在明确回顾片段/全文、服务器当前主题历史存在read_evidence成功事件且回答明显否认读取时，允许一次无工具补答，继续受步数和超时限制。不更改服务原答案，不保证识别所有语义矛盾。

会话测试适配新字段，新增临时目录和JWT身份测试：拥有者读写、他人及匿名不可读取/追加/停止/删除/流式访问；mode过滤和workspace恢复通过。报告生成器改用实际日期和实际夹具未覆盖次数。

## 三工具真实补测

| 工具 | 当前结果 | 单次耗时 |
| --- | --- | --- |
| predict | 8100接口连接失败，未得到预测值 | 0.058秒（失败返回） |
| recipe_optimize | 3001接口连接失败，未得到优化值 | 0.022秒（失败返回） |
| web_browse | GitHub公开API HTTP200，身份匹配，untrusted=true | 0.593秒 |

未启动业务服务或修改环境配置。预测源码虽已支持outputs_exp_best等目录，本地未见模型joblib及所需metadata产物；python/recipe_opt仍是46字节路径占位文件，并非实际Python包。须取得匹配新版源码的模型产物、metadata、完整优化包及其数据/模型文件，并提供可用Python环境，才能完成计算验收。失败耗时不是计算耗时。

## 原始记录

以下相对backend_impl，属于本地忽略的运行数据：

- 最终完整批次：`data/agent/evaluation/multiturn-1792377107931/`，含原始回答、输入、事件、代码SHA256、review-cases.json、results.json及18组完整测试结果.txt。
- 首批复查：`data/agent/evaluation/multiturn-1792376723413/`，保留原始输出；其中片段回顾矛盾是新增修复依据，不与最终批次混合计数。
- 三工具：`data/agent/integration/extra-tool-acceptance-2026-10-19T02-26-28-171Z/report.json`。
- 四页PPT：`data/agent/integration/tool-report-update-20261019/output/ASC-Agent工具与多轮问答测试结果-20261019.pptx`。沿用当前实际四页结构，保留旧文件。
- 代码备份：本地分支`backup/agent-before-sync-20261019`，提交`1d01697`。
- 报告与PPT备份：`D:/shixi/中关村学院/ASC-Agent同步备份-20261019/`；旧PPT备份和源文件SHA256相同。

## 复现与后续

在backend_impl中：

```powershell
& 'D:/node.js/node.exe' scripts/agent-multiturn-run.cjs --cases=all
& 'D:/node.js/node.exe' scripts/agent-extra-tools-acceptance.cjs
```

首条消耗模型额度，连续3次意外模型失败会停止，知识工具为固定夹具；第二条才是真实外部工具请求。原始报告不因重新生成汇总而改写。

后续完善MT18检索参数继承，补齐预测/优化部署资产后复验；新结果另建批次，保留本次结论边界。
