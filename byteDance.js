function patch(address) {
    Memory.protect(address, 4, 'rwx');
    Memory.writeByteArray(address, [0x00, 0x00, 0x80, 0x52]);
}

// function onLoad(name, callback) {
//     var Runtime = Java.use('java.lang.Runtime');
//     var System = Java.use('java.lang.System');
//     var VMStack = Java.use('dalvik.system.VMStack');
//     var VERSION = Java.use('android.os.Build$VERSION');
//     System.loadLibrary.overload('java.lang.String').implementation = function (libName) {
//         if (VERSION.SDK_INT.value >= 29) {
//             Runtime.getRuntime().loadLibrary0(Java.use('sun.reflect.Reflection').getCallerClass(), libName);
//         } else if (VERSION.SDK_INT.value >= 24) {
//             Runtime.getRuntime().loadLibrary0(VMStack.getCallingClassLoader(), libName);
//         } else {
//             Runtime.getRuntime().loadLibrary(libName, VMStack.getCallingClassLoader());
//         }
//         if (libName.includes(name)) {
//             callback();//无法执行到这里
//         }
//     };
// }

//参考: https://www.jianshu.com/p/4291ee42c412
function onLoad(name, callback) {
    //void* android_dlopen_ext(const char* filename, int flag, const android_dlextinfo* extinfo);//原型
    const android_dlopen_ext = Module.findExportByName(null, "android_dlopen_ext");
    if (android_dlopen_ext != null) {
        Interceptor.attach(android_dlopen_ext, {
            onEnter: function (args) {
                if (args[0].readCString().indexOf(name) !== -1) {
                    this.hook = true;
                }
            }, onLeave: function (retval) {
                if (this.hook) {
                    callback();
                }
            }
        });
    }
}

function main() {
    Java.perform(function () {
        //28.4.0
        const soName = 'libsscronet.so';
        //方法1, 内存搜索
        // onLoad(soName, function () {
        //     let libsscronet = Process.getModuleByName(soName);
        //     const verifyCertMatches = Memory.scanSync(libsscronet.base, libsscronet.size, "E0 E3 00 91 C1 14 80 12");
        //     verifyCertMatches.forEach(function (result) {
        //         let verifyCert = result.address.add(0xC);
        //         if (Instruction.parse(verifyCert).toString() === "mov w0, #1") {
        //             // 设置可读可写可执行
        //             Memory.protect(verifyCert, 4, 'rwx');
        //             // 修改为 mov w0, #0
        //             Memory.writeByteArray(verifyCert, [0x00, 0x00, 0x80, 0x52]);
        //         }
        //
        //         let handleVerifyInstruction = Instruction.parse(result.address.add(0x1A4));
        //         if (Instruction.parse(result.address.add(0x1A0)).toString() === "mov x0, x19" && handleVerifyInstruction.mnemonic === "bl") {
        //             let handleVerifyResult = new NativePointer(handleVerifyInstruction.opStr.replace('#', ''));
        //             Interceptor.attach(handleVerifyResult, {
        //                 onLeave: function (retval) {
        //                     if (retval > 0x0) retval.replace(0x0);
        //                 }
        //             });
        //         }
        //     });
        // });

        //方法2, 直接patch
        // onLoad(soName, function () {
        //     let libsscronet = Module.getBaseAddress(soName);
        //     let verifyCert = libsscronet.add(0x3700F0);
        //     let handleVerifyResult1 = libsscronet.add(0x370448);
        //     let handleVerifyResult2 = libsscronet.add(0x370494);
        //     console.log("修改前: " + Instruction.parse(verifyCert), Instruction.parse(handleVerifyResult1), Instruction.parse(handleVerifyResult2));
        //     patch(verifyCert);
        //     patch(handleVerifyResult1);
        //     patch(handleVerifyResult2);
        //     console.log("修改后: " + Instruction.parse(verifyCert), Instruction.parse(handleVerifyResult1), Instruction.parse(handleVerifyResult2));
        // })


        //方法3, hook SSL_CTX_set_custom_verify, 基本通杀
        onLoad(soName, () => {
            // void SSL_CTX_set_custom_verify(SSL_CTX *ctx, int mode, enum ssl_verify_result_t (*callback)(SSL *ssl, uint8_t *out_alert)) {
            //     ctx->verify_mode = mode;
            //     ctx->custom_verify_callback = callback;
            // }//原型
            let SSL_CTX_set_custom_verify = Module.getExportByName(soName, 'SSL_CTX_set_custom_verify');
            if (SSL_CTX_set_custom_verify != null) {
                Interceptor.attach(SSL_CTX_set_custom_verify, {
                    onEnter: function (args) {
                        Interceptor.attach(args[2], {
                            onLeave: function (retval) {
                                // enum ssl_verify_result_t BORINGSSL_ENUM_INT {
                                //     ssl_verify_ok,
                                //     ssl_verify_invalid,
                                //     ssl_verify_retry,
                                // };
                                //全部替换成 ssl_verify_ok
                                if (retval > 0x0) retval.replace(0x0);
                            }
                        });
                    }
                });
            }
        });

        //只需要选择其中一种即可, 推荐使用方法3
    });
}

setImmediate(main);
// setTimeout(main, 3000);
// frida -U -f com.ss.android.ugc.aweme -l Android/byteDance.js