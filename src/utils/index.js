import axios from 'axios';
import $http from './http';
export const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * 你也可以通过js方式引入，在http-request时调用此方法
 * @param {*} options
 * file: 文件对象
 * fileList 上传文件列表
 * onStart 上传开始
 * onProgress 上传进度回调
 * onSuccess 上传完成
 * onFail 上传失败
 * @returns
 */
// 分片上传
export const uploadByPieces = async (options) => {
    const baseURL = '/opple/webadmin';
    const { file, fileList, onStart, onProgress, onSuccess, onFail } = options;
    let uploadId = ''; // 文件唯一标识
    const fileName = file.name; // 文件名
    const totalSize = file.size; // 文件总大小
    const chunkSize = 10 * 1024 * 1024; // 10MB一片
    const chunkCount = Math.ceil(file.size / chunkSize); // 总片数
    const MAX_REQUEST = 6; // 最大并发请求数量，超出的请求会被放入队列中
    const chunkList = []; // 分片列表,用于存放每个分片的信息
    const cancelTokenSource = axios.CancelToken.source(); // 创建一个axios的cancelTokenSource（取消令牌）

    // 初始化上传,获取文件唯一标识 uploadId
    const initChunk = async () => {
        return new Promise(async (resolve) => {
            const { content } = await $http.post(`/file/initiatePart?fileName=${fileName}`)
            uploadId = content.uploadId;
            onStart({ cancelTokenSource })
            resolve(content);
        });
    }

    // 合并分片
    const mergeChunk = () => {
        return $http.get(`/file/mergePartNew?uploadId=${uploadId}`)
    }

    // 获取当前chunk分片数据
    const getChunkInfo = (file, index) => {
        const start = index * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunk = file.slice(start, end);
        return chunk;
    };

    // 分片上传接口
    const uploadChunk = (index) => {
        return new Promise((resolve, reject) => {
            const partNumber = index + 1; // partNumber 只能从1开始
            const formData = chunkList[index].formData;
            axios({
                url: `${baseURL}/file/uploadPartNew?partNumber=${partNumber}&uploadId=${uploadId}`,
                method: 'post',
                data: formData,
                headers: { 'Content-Type': 'multipart/form-data' },
                cancelToken: cancelTokenSource.token,
                onUploadProgress: (e) => {
                    // 记录每个分片的上传进度
                    chunkList[index].loaded = e.loaded;
                    // 计算总进度 汇总每个分片的上传进度/总大小
                    e.totalProgress = (chunkList.reduce((prev, cur) => prev + cur.loaded, 0) / totalSize) * 100;
                    // 限制最大进度为99.9,最终上传成功以后端接口返回为准
                    e.totalProgress = Math.min(e.totalProgress, 99.9);
                    onProgress(e, file);
                },
            }).then((res) => {
                if (res.data.code !== 200) reject(res.data);
                resolve(res.data);
            }).catch((e) => {
                reject(e);
            });
        });
    };

    try {
        await initChunk();
        // 针对每个文件进行chunk处理
        for (let index = 0; index < chunkCount; ++index) {
            const chunk = getChunkInfo(file, index);
            const formData = new FormData();
            formData.append('file', chunk);
            chunkList.push({
                loaded: 0,
                index,
                formData
            });
        }
        // console.log('chunkList', chunkList);

        // 临时存放并发请求的列表
        const requestsList = [...chunkList]
        // 通过 while 解决最大并发请求问题
        // 根据第一次选择的fileList的文件数量来平分MAX_REQUEST
        while (requestsList.length) {
            const requests = requestsList.splice(0, Math.ceil(MAX_REQUEST / fileList.length));
            await Promise.all(requests.map((item) => uploadChunk(item.index)));
        }
        const successRes = await mergeChunk();
        // console.log('onSuccess', successRes);
        onSuccess(successRes);
        return successRes;
    } catch (e) {
        cancelTokenSource.cancel('上传失败');
        console.error('uploadByPieces error', e);
        onFail(e);
        return e;
    }
};