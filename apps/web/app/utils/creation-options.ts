export type CreationKind='component'|'chart'|'divider'
export const creationOptions:{value:CreationKind;label:string;description:string}[]=[
 {value:'component',label:'自由创作',description:'图文卡片、通知、人物介绍与自定义版式'},
 {value:'chart',label:'数据图表',description:'折线、柱状、饼图等，数据可继续修改'},
 {value:'divider',label:'分隔符',description:'细线、点状、章节题签与留白'},
]
