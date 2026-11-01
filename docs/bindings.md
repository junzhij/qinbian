# 可修改的组件协议

## 颜色

配色包含3—6个颜色槽位，id为`color1`至`color6`。每个槽位的中文名称可修改，引用始终使用id。三档为`regular`主题色、`highlight`强调色、`light`减淡色。

```json
{
  "name": "书卷三色",
  "colors": [
    {"id":"color1","name":"墨蓝","regular":"#183A49","highlight":"#142F3C","light":"#E3E7E9"},
    {"id":"color2","name":"灰青","regular":"#567067","highlight":"#475C54","light":"#EBEEED"},
    {"id":"color3","name":"朱砂","regular":"#9E4B3B","highlight":"#823E30","light":"#F3E9E7"}
  ]
}
```

生成HTML可以使用颜色占位符：

```html
<section style="background-color:{{color2-light}};border-left:3px solid {{color3-highlight}};">
  <p style="color:{{color1-regular}};font-size:15px;line-height:1.85;">
    <span leaf="">正文</span>
  </p>
</section>
```

存储前，解析器将占位符变为真实内联色值，并在`data-qb-styles`中保存映射。`colorMappings`可以将`color1-regular`映射为其他代号或固定十六进制颜色。前端与导出共用解析器，导出不依赖CSS变量。

单独指定的文字颜色可标记`data-qb-custom-color="true"`，防止重新关联到主题色。个别属性手动设置可用`data-qb-custom-properties="width,background-color"`。导出时这些标记会被移除。

## 文案和数据

组件data支持`fields`、`values`、`palette`和`colorMappings`。字段id稳定，label供编辑面板展示。

```json
{
  "fields": [
    {"id":"title","label":"标题","type":"text","default":"书页里的小记"},
    {"id":"current","label":"当前人数","type":"number","default":25,"min":0},
    {"id":"total","label":"总人数","type":"number","default":40,"min":1},
    {"id":"percent","label":"完成比例","type":"computed","default":0,"formula":{"op":"percent","numerator":"current","denominator":"total"}}
  ],
  "values": {"title":"书页里的小记","current":25,"total":40}
}
```

```html
<section style="padding:12px 16px;" data-qb-field="title"><span leaf="">{{title}}</span></section>
<p><span leaf="" data-qb-field="percent">{{percent}}</span>％</p>
<section style="height:6px;width:{{percent}}%;background-color:{{color3-highlight}};"></section>
```

type还支持`image`，值为素材库图片地址或素材id。空图片字段保留选择图片的位置。计算字段只支持明确的百分比结构，不执行任意表达式。右侧字段编辑更新values；画布改字会反向同步字段值。

未显式标记的旧版“文本框内容占位”等单纯文案容器会自动获得文本字段。`div + span`以及普通段落、标题均支持直接编辑。富文本只接管当前文字容器，保留外层版式；重复点击、选字和双击不会重建整个组件。

## 图片形状与裁切

图片字段支持 `image:{shape:"circle",ratio:1}`，`shape` 为 `rect`、`circle` 或 `rounded`，`ratio` 为宽/高，省略时保持原图比例；圆形固定1:1。圆角使用相对短边的 `radius`，默认0.08，范围0—0.5。

```html
<img data-qb-field="portrait" data-qb-field-type="image"
     data-qb-image='{"shape":"circle","ratio":1}'
     style="width:120px;max-width:100%;height:auto;margin:0 auto 16px;">
```

空字段提供选图入口。选图会按形状与比例居中裁切；网页裁切器可调整位置、缩放与比例。API为 `POST /api/assets/:id/crop`，请求 `{spec:{shape:"circle",ratio:1},rect:{x:0.25,y:0,width:0.5,height:1}}`，坐标均相对旋转校正后的原图。省略rect时自动居中。

返回独立素材，`sourceAssetId` 指向原图，`crop` 保存形状与范围。再次调整从原图取景，避免反复裁切损失。圆形、圆角写入透明像素；GIF逐帧裁切，保留循环与时长。原图被裁切副本引用时禁止删除。已存在的圆形占位会识别尺寸和位置，不再将方图塞进占位外框。

导出在移除编辑标记之前完成裁切，转为微信兼容的section/p标签，并将字体样式写到文字层。边框、底色、圆角与间距保留内联值；图片内嵌，复制不依赖编辑器控件或CSS遮罩。

## 生成结果

组件模式返回`name`、`description`、`category`、`tags`、`html`、`fields`及`values`。配色卡模式只返回`name`、`description`和`colors`。后台进行格式、图片引用和正文样式检查，通过后仍须用户预览确认。

模板和文章的每个组件实例都保存自己的HTML、配色、映射和字段快照。配色卡复用采用复制，更新配色卡不会悄悄改变旧稿。

## 数据图与分隔符

数据图在section的`data-qb-chart` JSON中声明类型、分类、系列、主题颜色及单位。数值可引用`{{fieldId}}`，不能执行表达式。受控渲染器生成PNG，并保留可读的原始数据文字；改数值或映射颜色会重新绘图。完整协议见`skills/component-design/references/data-charts.md`。

分隔符生成器提供细线、双线、点状与章节题签，使用边框及可修改字段。规范见`skills/component-design/references/dividers.md`。

## 整篇文章外观

文章保存`appearance:{backgroundColor:"#EEF3EB"}`，六位十六进制色值，默认`#FFFFFF`。编排模板在`data.appearance`中保存同样设置；套用、复制、历史恢复、备份恢复与导出都会保留。仅修改文章外层，组件内部的明确底色保持原样。旧数据库通过0004迁移补白色背景。

`appearance.textStyles`为可选全文文字规则，包含`enabled`、`preserveOverrides`和`roles`。五种角色为`body`、`heading`、`subheading`、`caption`、`quote`；每种可设`fontSize`、`lineHeight`、`align`、`indent`、`before`、`after`、`letterSpacing`、`weight`、`font`及可空的`color`。使用共享`normalizeTextStyles()`创建完整规则；无此设置时保留旧稿。

段落可显式写`data-qb-role="body"`，`none`不参与全文规则。缺少角色的旧稿按字段、标签、字号及用途保守识别；图表、代码、数据表默认保留。`data-qb-style-mode="independent"`使该区域独立。应用时只调整文字属性，不重建组件外框。`data-qb-typography`由系统记录还原基线；不要由AI编造。手动字号与自定义色记录为局部例外；`data-qb-text-overrides`用于既保持主题映射又独立于全文规则的文字颜色。重置局部文字后重新跟随；导出时删除这些记录，只留实际内联样式。

## 点选与局部AI修改

选中位置使用组件内部的元素索引`path`，并保存所选HTML的`fingerprint`作为并发检查标记。悬停边框及尺寸标签位于画布外，不进入HTML。文字编辑仍只交给原段落编辑器，图片仍交给共享裁切器。

AI请求传`selection:{path,fingerprint}`和`locks:{text:true,images:true,data:true}`，文章同时传`blockId`。服务端从当前文章重新提取所选区域，只发送相关字段、计算依赖及少量父层信息。候选必须同标签、单根、保留字段标记，并通过文字、图片及数据锁检查；只替换对应元素。变化的文字属性记作局部例外，结构大改记为独立区域。应用前核对文章版本及元素指纹，过期候选仍可另存。接口测试使用隔离数据库和本机模拟服务；真实DeepSeek验证单独执行。

## 字体

新正文默认继承公众号字体，不注入界面QinSerif字体。预览用平台默认栈回退，导出不主动指定字体族；明确选择的设备字体仍保留。详情与未完成的微信真机验收状态见README“字体兼容状态”。
