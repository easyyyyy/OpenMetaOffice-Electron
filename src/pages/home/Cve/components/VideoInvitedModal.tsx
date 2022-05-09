import { Modal } from "antd"
import { FC } from "react"
import { MyAvatar } from "../../../../components/MyAvatar";
import { ConversationItem } from '../../../../utils/open_im_sdk/types/index'
import { UserOutlined } from "@ant-design/icons";

type VideoInviteModalProps = {
    accept: (videoInvitedData: any) => void;
    reject: () => void;
    visible: boolean;
    videoInvitedData?: any;
}

const VideoInviteModal:FC<VideoInviteModalProps> = ({accept, reject, visible, videoInvitedData}) => {
    const handerReject = () => {
        reject()
    }

    const handerAccept = () => {
        accept(videoInvitedData)
    }

    return (
        <Modal
        className="rtc_modal"
        width={'400px'}
        visible={visible}
        footer={null}
        closable={false}>
            <div className="rtc_body" style={{width:'400px',height:'300px'}}>
                <div className="body_actions" style={{justifyContent: "space-between"}}>
                    <div className="body_actions_tops">
                    <MyAvatar shape="square" size={42} src={videoInvitedData?.senderFaceUrl} icon={<UserOutlined />} />
                        <div className="nickname">{videoInvitedData?.senderNickname}</div>
                        <div>正在发起视频通话</div>
                    </div>
                    <div className="body_actions_bottom">
                        <div className="actions">
                            <div className="bottom_actions_item">
                                <img
                                className="rtc_action_icon"
                                src="data:image/png;base64,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"
                                alt=""
                                onClick={handerAccept}/>
                                <div>接听</div>
                            </div>
                            <div className="bottom_actions_item">
                                <img
                                className="rtc_action_icon"
                                src="data:image/png;base64,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"
                                alt=""
                                onClick={handerReject}/>
                                <div>拒绝</div>
                            </div>
                        </div>
                    </div>
                </div>
                
            </div>
        </Modal>
    )
}

export default VideoInviteModal
