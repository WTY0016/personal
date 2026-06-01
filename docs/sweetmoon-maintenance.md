# Sweetmoon 页面维护说明

## 预览方式

不要直接双击 `sweetmoon/index.html` 预览。浏览器会限制静态页面读取本地 JSON，导致行程加载失败。

在仓库根目录启动本地静态服务器：

```bash
python3 -m http.server 4173
```

然后访问：

```text
http://127.0.0.1:4173/sweetmoon/
```

GitHub Pages 发布后访问：

```text
https://xxx.github.io/personal/sweetmoon/
```

## 修改行程数据

滚动叙事页面主要数据在：

```text
sweetmoon/data/journey.json
```

可以修改：

- `meta.startDate`：左侧时间轴开始日期
- `meta.endDate`：左侧时间轴结束日期
- `scenes`：滚动叙事段落
- `scenes[].type`：`transport`、`country`、`city`
- `scenes[].mode`：`flight`、`train`、`local`、`country`、`city`
- `scenes[].background.image`：当前段落的背景图，会随滚动淡入淡出
- `scenes[].map.points`：地图路线点，可加入中转地、火车经停点或市内动线
- `scenes[].images`：国家/城市图文展示图片
- `scenes[].spotlight`：城市段重点推荐图文卡，可放博物馆、景点、餐厅、特色美食、避雷项
- `scenes[].spotlight[].kind`：图文卡分类，如 `博物馆`、`餐厅`、`特色美食`
- `scenes[].spotlight[].title`：图文卡标题
- `scenes[].spotlight[].image`：图文卡图片地址
- `scenes[].spotlight[].description`：图文卡说明文字
- `scenes[].sections`：景点、美食、特产、购物等图文说明
- `scenes[].tips`：交通、购票、安全等提示

原始详细每日攻略数据保留在：

```text
sweetmoon/data/itinerary.json
```

可以修改：

这个文件可作为细节备份，不直接驱动当前滚动叙事版页面。

修改后刷新网页即可看到新内容。JSON 必须保持合法格式：字符串使用英文双引号，数组和对象之间用英文逗号。

## 地图实现

页面使用本地保存的 Leaflet 加载 CARTO 深色底图，底图数据基于 OpenStreetMap，不需要 Google Maps API Key。

相关文件：

```text
sweetmoon/app.js
sweetmoon/styles.css
```

如果以后想换底图，修改 `sweetmoon/app.js` 里的 `L.tileLayer(...)` URL 和 attribution。必须保留 OpenStreetMap/CARTO 署名。

## 文件结构

```text
sweetmoon/
├── index.html
├── styles.css
├── app.js
├── favicon.svg
├── vendor/
│   └── leaflet/
│       ├── leaflet.css
│       └── leaflet.js
└── data/
    ├── journey.json
    └── itinerary.json
```
