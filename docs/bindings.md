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
