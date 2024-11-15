# 分片大文件上传
项目中有涉及到素材上传的功能，小的文件上传已经不能满足当前的需求。可能会存在1-5GB的文件，假如依旧采取原方式，接口和服务端会出现超时情况。那么此时就可以考虑采用**分片上传**的方式了，当然也建议你通过第三方上传以生成URL的方式解决功能要求。

<p align="center"><img src="https://raw.githubusercontent.com/sunwenxu1997/fragment-upload/refs/heads/main/public/images/fenpian1.gif" alt="fenpian1.gif"></p>

# 实现思路

<p align="center"><img width="400px" src="https://raw.githubusercontent.com/sunwenxu1997/fragment-upload/refs/heads/main/public/images/readme-1.png" alt="企业微信截图_17316376868031.png"></p>

1.  调用后端的分片初始化接口，后端根据文件名生成唯一标识`uploadId`(用于后续合并文件);
2.  前端分片处理文件，并调用后端分片接口，把分好的文件通过索引(`partNumber`)+标识(`uploadId`)+切片文件(`file`)的方式给到后端;
3.  最终调用后端合并接口，以最终返回的合并文件路径为准;

# 技术实现

*   前端：vue2，element-ui
*   后端：java，[阿里云oss分片上传](https://help.aliyun.com/zh/oss/user-guide/multipart-upload?spm=a2c4g.11186623.help-menu-31815.d_2_3_2_1.21642382pmHf7g\&scm=20140722.H_31850._.OR_help-V_1)
*   [前端项目地址](https://github.com/sunwenxu1997/fragment-upload)

## 文件分片

1.  获取文件需要分片的总数

```js
CHUNK_SIZE: 5 * 1024 * 1024, // 5MB一片
context.chunkCount = Math.ceil(file.size / this.CHUNK_SIZE) // 总片数
```

2.  基于获得的 `chunkCount` 总片数和 `chunkSize` 每片大小，进行`for`循环，切割文件

```js
    // 获取当前chunk分片数据
    getChunkInfo(context, index) {
      const { file, chunkSize } = context
      const start = index * chunkSize
      const end = Math.min(file.size, start + chunkSize)
      const chunk = file.slice(start, end)
      return chunk
    }
```

## 多请求并发

假设文件分为了100片，同时请求100个接口肯定会影响性能，因此这里限制了[最大并发数量为6](https://juejin.cn/post/7200033099752407097#heading-7)，通过`Promise`建立执行队列，超出这个数量时会在队列中等待执行。

```js
MAX_REQUEST: 6 // 最大并发请求数量，超出的请求会被放入队列中
```

```js
// 临时存放并发请求的列表
const requestsList = [...context.chunkList]
// 通过 while 解决最大并发请求问题
// 根据第一次选择的fileList的文件数量来平分MAX_REQUEST
while (requestsList.length) {
const requests = requestsList.splice(0, Math.ceil(this.MAX_REQUEST / this.uploadFilesList.length))
await Promise.all(requests.map((item) => this.uploadChunk(context, item.index)))
}
```

<p align="center"><img width="400px" src="https://raw.githubusercontent.com/sunwenxu1997/fragment-upload/refs/heads/main/public/images/fenpian2.gif"></p>

## 上传进度

这里还是通过`axios`提供的前端上传进度监听`onUploadProgress`的方式实现，即便这种方式还是要依赖于最终后端服务的返回，但却能更简单的解决我当下问题。

你也可以采取[其它方案](https://juejin.cn/post/7200033099752407097#heading-5)。(例如:根据后端接口实际成功响应，分段展示上传的百分比进度)

```js
    // 上传分片
    async uploadChunk(context, index) {
      ...
        this.$http({
          url: `xxxx?uploadId=${uploadId}&partNumber=${partNumber}`,
          method: 'post',
          data: formData,
          headers: { 'Content-Type': 'multipart/form-data' },
          cancelToken: cancelTokenSource.token, // 取消令牌
          onUploadProgress: (e) => {
            // 记录每个分片的上传进度
            context.chunkList[index].loaded = e.loaded
            // 计算总进度 汇总每个分片的上传进度/总大小
            e.totalProgress = (context.chunkList.reduce((prev, cur) => prev + cur.loaded, 0) / totalSize) * 100
            // 限制最大进度为99.9,最终上传成功以后端接口返回为准
            e.totalProgress = Math.min(e.totalProgress, 99.9)
            this.onProgressUpload(e, file)
          }
        })
      ...
    },
```

## 取消上传

借助`axios`的`cancelTokenSource`取消令牌，来及时阻断请求的上传，避免资源浪费。

首次会初始化，后面基于当前文件，都会放在`uploadChunk`每个分片上传中，以便接口异常或手动取消上传时，统一取消。

```js
context.cancelTokenSource = axios.CancelToken.source() // 创建一个axios的cancelTokenSource（取消令牌）
...
catch (error) {
   cancelTokenSource.cancel('上传失败')
   console.error('uploadByPieces error', e)
}
```

```js
// 用户手动删除取消
handleDel(index) {
      this.$confirm('是否删除该文件?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.uploadFilesList[index]?.cancelTokenSource.cancel('取消上传')
        this.uploadFilesList.splice(index, 1)
 })
}
```

<p align="center"><img src="https://raw.githubusercontent.com/sunwenxu1997/fragment-upload/refs/heads/main/public/images/readme-2.png" alt="image.png"></p>

# 可能对你有帮助

*   [全网最全面的"大文件上传" - 前端:Vue3+TS+Vite, 后端:node+express](https://juejin.cn/post/7200033099752407097)
*   [获取上传进度的几种方式](https://juejin.cn/post/7265239806946590757)
*   [大文件上传优化（切片、断点续传、秒传）-前、后端demo](https://juejin.cn/post/7323883238896058387)

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```