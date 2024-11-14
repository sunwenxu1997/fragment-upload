<template>
  <div class="upload-fragment">
    <el-upload
      drag
      multiple
      :show-file-list="false"
      :accept="accept"
      :http-request="onHttpRequestUpload"
      :before-upload="beforeUpload"
      :file-list="uploadFilesList"
      action="https://jsonplaceholder.typicode.com/posts/"
    >
      <i class="el-icon-upload"></i>
      <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
      <!-- <div class="el-upload__tip" slot="tip">只能上传jpg/png文件，且不超过500kb</div> -->
    </el-upload>
    <el-table :data="uploadFilesList" border style="margin-top: 50px">
      <el-table-column prop="name" :show-overflow-tooltip="true" label="文件名" width="150" />
      <el-table-column prop="uid" align="center" label="是否成功" width="200">
        <template slot-scope="scope">
          <template v-if="scope.row.status === 'success'">上传成功！</template>
          <template v-else-if="scope.row.status === 'error'">上传失败!</template>
          <el-progress
            v-else
            status="success"
            :text-inside="true"
            :stroke-width="14"
            :percentage="scope.row.progress"
          />
        </template>
      </el-table-column>
      <el-table-column width="120" prop="fileSize" label="大小" align="center" />
      <el-table-column fixed="right" label="操作" width="100">
        <template slot-scope="scope">
          <el-button type="text" @click="handleDel(scope.$index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { formatBytes } from '@/utils'
import axios from 'axios'
export default {
  data() {
    return {
      accept: 'video/mp4',
      uploadFilesList: [],
      CHUNK_SIZE: 5 * 1024 * 1024, // 5MB一片
      MAX_REQUEST: 6 // 最大并发请求数量，超出的请求会被放入队列中
    }
  },
  methods: {
    beforeUpload(file) {
      console.log('---beforeUpload', file)
      // 遍历file文件key值，然后将文件信息push到uploadFilesList中
      let fileMap = {}
      for (let key in file) {
        fileMap[key] = file[key]
      }
      this.uploadFilesList.push({
        ...fileMap,
        status: 'uploading', // 上传状态
        progress: 0, // 上传进度
        fileSize: formatBytes(file.size) // 文件大小
      })
    },
    async onHttpRequestUpload(context) {
      const file = context.file // 文件
      context.totalSize = file.size // 文件总大小
      context.chunkSize = this.CHUNK_SIZE // 分片大小
      context.chunkCount = Math.ceil(file.size / this.CHUNK_SIZE) // 总片数
      context.chunkList = [] // 分片列表,用于存放每个分片的信息
      context.cancelTokenSource = axios.CancelToken.source() // 创建一个axios的cancelTokenSource（取消令牌）
      const { uploadId } = await this.initChunk(context)
      context.uploadId = uploadId
      const { chunkCount, cancelTokenSource } = context
      try {
        // 针对每个文件进行chunk处理
        for (let index = 0; index < chunkCount; ++index) {
          context.chunkList.push({ loaded: 0, index })
        }
        // 临时存放并发请求的列表
        const requestsList = [...context.chunkList]
        // 通过 while 解决最大并发请求问题
        // 根据第一次选择的fileList的文件数量来平分MAX_REQUEST
        while (requestsList.length) {
          const requests = requestsList.splice(0, Math.ceil(this.MAX_REQUEST / this.uploadFilesList.length))
          await Promise.all(requests.map((item) => this.uploadChunk(context, item.index)))
        }
        const successRes = await this.mergeChunk(context)
        console.log('---mergeChunk success', successRes.data)
        this.onSuccessUpload(successRes.data, file)
      } catch (error) {
        cancelTokenSource.cancel('上传失败')
        console.error('uploadByPieces error', e)
      }
    },
    // 上传进度
    onProgressUpload(event, file) {
      // console.log('---onProgressUpload', event, file)
      console.log('---onProgressUpload', event.totalProgress)
      const index = this.uploadFilesList.findIndex((item) => item.uid === file.uid)
      this.$set(
        this.uploadFilesList[index],
        'progress',
        Number(event.totalProgress ? event.totalProgress.toFixed(1) : 0)
      )
    },
    // 上传成功
    onSuccessUpload(response, file) {
      const index = this.uploadFilesList.findIndex((item) => item.uid === file.uid)
      this.$set(this.uploadFilesList[index], 'response', response)
      this.$set(this.uploadFilesList[index], 'progress', 100)
      this.$set(this.uploadFilesList[index], 'status', 'success')
      this.$emit('success', this.uploadFilesList)
    },
    handleDel(index) {
      this.$confirm('是否删除该文件?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.uploadFilesList[index]?.cancelTokenSource.cancel('取消上传')
        this.uploadFilesList.splice(index, 1)
      })
    },
    // 初始化上传,获取文件唯一标识 uploadId
    initChunk(context) {
      const fileName = context.file.name
      console.log('---initChunk', context)
      return new Promise(async (resolve) => {
        const res = await this.$http.post(`/opple/webadmin/file/initiatePart?fileName=${fileName}`)
        const fileIndex = this.uploadFilesList.findIndex((item) => item.uid === context.file.uid)
        this.$set(this.uploadFilesList[fileIndex], 'cancelTokenSource', context.cancelTokenSource)
        const { content } = res.data
        resolve(content)
      })
    },

    // 上传分片
    async uploadChunk(context, index) {
      const { uploadId, file, totalSize, cancelTokenSource } = context
      return new Promise(async (resolve) => {
        const partNumber = index + 1 // partNumber 只能从1开始
        const chunk = this.getChunkInfo(context, index)
        const formData = new FormData()
        formData.append('file', chunk)
        this.$http({
          url: `/opple/webadmin/file/uploadPartNew?uploadId=${uploadId}&partNumber=${partNumber}`,
          method: 'post',
          data: formData,
          headers: { 'Content-Type': 'multipart/form-data' },
          cancelToken: cancelTokenSource.token,
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
          .then((res) => {
            resolve(res.data)
          })
          .catch((error) => {
            this.$message.error(error.chnDesc || error.message || '上传失败')
            console.error('uploadChunk error', error)
          })
      })
    },

    // 合并分片
    mergeChunk(context) {
      return this.$http.get(`/opple/webadmin/file/mergePartNew?uploadId=${context.uploadId}`)
    },
    // 获取当前chunk分片数据
    getChunkInfo(context, index) {
      const { file, chunkSize } = context
      const start = index * chunkSize
      const end = Math.min(file.size, start + chunkSize)
      const chunk = file.slice(start, end)
      return chunk
    }
  }
}
</script>

<style scoped>
.upload-fragment {
  width: 50vw;
  text-align: center;
}
</style>
>
