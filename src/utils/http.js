import axios from 'axios';

const instance = axios.create({
    baseURL: '/opple/webadmin',
    timeout: 30000,
});

// Request interceptor
instance.interceptors.request.use(
    (config) => {
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
instance.interceptors.response.use(
    (response) => {
        const res = response.data
        if (res.code !== 200) {
            return Promise.reject(new Error(res.chnDesc || 'Error'))
        } else {
            return response
        }
    },
    (error) => {
        console.log('err' + error) // for debug
        return Promise.reject(error);
    }
);

export default instance;
